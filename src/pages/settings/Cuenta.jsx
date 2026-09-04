/**
 * PESTAÑA "CUENTA Y SEGURIDAD" DE CONFIGURACIÓN.
 *
 * Junta lo que en Settings.jsx vivía repartido en cuatro pestañas:
 *   - Seguridad: el correo (solo lectura) y el cambio de contraseña.
 *   - Mi Empresa: "Nombre en la cabecera". Es el displayName de Firebase
 *     Auth —del usuario, no de la empresa—, por eso va acá junto al correo.
 *   - Documentos: "Privacidad y permisos", ahora "Qué ven los usuarios
 *     secundarios". El manual enlaza a sus tres anclas `opcion-<flag>`.
 *   - Notificaciones: las preferencias push y el detector de pagos Yape.
 *   - Limpieza: el borrado masivo, ahora "Zona de peligro", con la regla del
 *     commit 859a9dd0 intacta: solo dueño o administrador, ELIMINAR más la
 *     contraseña, y comprobantes/guías únicamente el administrador de Cobrify.
 *
 * Qué escribe y dónde (cada sección tiene su propio botón Guardar):
 *   - Nombre en la cabecera → Firebase Auth, vía `updateDisplayName` del contexto.
 *   - Contraseña → Firebase Auth (`reauthenticateWithCredential` + `updatePassword`).
 *   - `hideDashboardDataFromSecondary`, `showOnlyOwnSalesToSecondary`,
 *     `hideCashExpectedFromCashier` → businesses/{id} vía `useGuardado`.
 *   - `notificationPreferences` → businesses/{id} vía `useGuardado`.
 *   - Detector Yape → subdocumento businesses/{id}/settings/yapeNotifications
 *     con su propio setDoc: lo lee `yapeService` y la app nativa, no es un
 *     campo del documento del negocio (excepción prevista en la partición).
 *   - Zona de peligro → los servicios deleteAll… y resetAll… de bulkDeleteService.
 *
 * Lo que se quitó a propósito: las "Recomendaciones de seguridad" (texto
 * decorativo), las "Instrucciones de uso - Yape" en tres pasos con círculos
 * morados (queda una nota de dos líneas) y todas las cajas de colores.
 *
 * Duplicidad documentada, no resuelta: `notificationPreferences` también
 * existe POR USUARIO en src/pages/Users.jsx (~1861–1933) con otra lista de
 * opciones (yape_payment, new_order, new_sale, low_stock). Lo de acá es la
 * preferencia del negocio; lo de allá, la de cada sub-usuario.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Trash2 } from 'lucide-react'
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useGuardado } from '@/components/settings/useGuardado'
import { Seccion, Ajuste, Campo, Nota, BarraGuardar, Separador } from '@/components/settings/kit'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import VersionApp from '@/components/VersionApp'
import { getYapeConfig } from '@/services/yapeService'
import {
  deleteAllProducts,
  deleteAllCustomers,
  deleteAllSuppliers,
  deleteAllInvoices,
  deleteAllPurchases,
  deleteAllStockMovements,
  deleteAllDispatchGuides,
  deleteAllQuotations,
  resetAllStock,
  resetAllIngredientStock,
  deleteIngredientStockMovements,
  deleteAllProductions,
  countDocuments,
} from '@/services/bulkDeleteService'

// Las seis notificaciones push que el negocio puede apagar. La clave es la
// del mapa `notificationPreferences` del documento del negocio.
const NOTIFICACIONES = [
  { key: 'new_sale', titulo: 'Nueva venta', descripcion: 'Recibir notificación cuando se registra una nueva venta.' },
  { key: 'yape_payment', titulo: 'Pago Yape', descripcion: 'Recibir notificación cuando se detecta un pago por Yape.' },
  { key: 'low_stock', titulo: 'Stock bajo', descripcion: 'Recibir notificación cuando un producto baja hasta su stock mínimo (el que le pusiste al producto; 3 si no le pusiste ninguno).' },
  { key: 'out_of_stock', titulo: 'Producto sin stock', descripcion: 'Recibir notificación cuando un producto se queda sin stock.' },
  { key: 'new_order', titulo: 'Nuevo pedido', descripcion: 'Recibir notificación cuando se crea un nuevo pedido (restaurante/menú digital).' },
  { key: 'items_added', titulo: 'Items agregados a un pedido', descripcion: 'Recibir notificación cuando se agregan items a un pedido existente.' },
]

// Todas encendidas mientras el negocio no haya guardado ninguna: son los
// valores iniciales de siempre.
const PREFERENCIAS_POR_DEFECTO = {
  new_sale: true,
  yape_payment: true,
  low_stock: true,
  out_of_stock: true,
  new_order: true,
  items_added: true,
}

// Etiquetas de cada tipo de borrado. `actionVerb: 'limpiar'` distingue los
// reinicios de inventario (no borran el catálogo) de las eliminaciones.
const bulkDeleteLabels = {
  products: { name: 'Productos', collection: 'products' },
  customers: { name: 'Clientes', collection: 'customers' },
  suppliers: { name: 'Proveedores', collection: 'suppliers' },
  invoices: { name: 'Ventas/Comprobantes', collection: 'invoices' },
  purchases: { name: 'Compras', collection: 'purchases' },
  stockMovements: { name: 'Movimientos de Stock', collection: 'stockMovements' },
  dispatchGuides: { name: 'Guías de Remisión', collection: 'dispatchGuides' },
  quotations: { name: 'Cotizaciones', collection: 'quotations' },
  resetStock: { name: 'Stock e Inventario', collection: 'products', actionVerb: 'limpiar', successMessage: 'Stock reseteado en {count} productos y movimientos eliminados' },
  resetIngredientStock: { name: 'Stock de Insumos', collection: 'ingredients', actionVerb: 'limpiar', successMessage: 'Stock reseteado en {count} insumos; movimientos y producciones eliminados' },
}

/** Los comprobantes y guías ya emitidos tienen valor tributario y el negocio
 *  está obligado a conservarlos: no se borran desde el autoservicio. Solo el
 *  administrador de Cobrify, para limpiar cuentas de prueba. */
const SOLO_ADMINISTRADOR = ['invoices', 'dispatchGuides']

// Las filas de borrado, en el orden de siempre. `avisoSoloAdmin` es el title
// del botón apagado cuando quien mira no es el administrador de Cobrify.
const FILAS_BORRADO = [
  { tipo: 'products', titulo: 'Productos', descripcion: 'Eliminar todos los productos del catálogo' },
  { tipo: 'customers', titulo: 'Clientes', descripcion: 'Eliminar todos los clientes registrados' },
  { tipo: 'suppliers', titulo: 'Proveedores', descripcion: 'Eliminar todos los proveedores' },
  { tipo: 'invoices', titulo: 'Ventas / Comprobantes', descripcion: 'Eliminar todas las facturas, boletas y notas de venta', avisoSoloAdmin: 'Los comprobantes emitidos se conservan. Escríbenos a soporte si necesitas limpiarlos.' },
  { tipo: 'purchases', titulo: 'Compras', descripcion: 'Eliminar todas las compras registradas' },
  { tipo: 'stockMovements', titulo: 'Movimientos de stock', descripcion: 'Eliminar historial de movimientos de inventario' },
  { tipo: 'dispatchGuides', titulo: 'Guías de remisión', descripcion: 'Eliminar todas las guías de remisión', avisoSoloAdmin: 'Las guías emitidas se conservan. Escríbenos a soporte si necesitas limpiarlas.' },
  { tipo: 'quotations', titulo: 'Cotizaciones', descripcion: 'Eliminar todas las cotizaciones' },
]

const CONTEOS_EN_CERO = {
  products: 0, customers: 0, suppliers: 0, invoices: 0, purchases: 0,
  stockMovements: 0, dispatchGuides: 0, quotations: 0, ingredients: 0, productions: 0,
}

/**
 * Un campo de contraseña con su botón de ver/ocultar. El icono va en un botón
 * de acción, el único sitio donde el kit los admite.
 */
function CampoContrasena({ etiqueta, ayuda, value, onChange, visible, onToggle, placeholder, autoComplete, minLength }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </Campo>
  )
}

/**
 * Una fila de la zona de peligro: qué se borra, cuántos registros hay y el
 * botón. Rojo porque es destructivo: el único rojo que admite el kit.
 */
function FilaPeligro({ titulo, children, onClick, disabled, title }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{titulo}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{children}</p>
      </div>
      <Button type="button" variant="danger" size="sm" onClick={onClick} disabled={disabled} title={title} className="shrink-0">
        <Trash2 className="w-4 h-4 mr-1" />
        Limpiar
      </Button>
    </div>
  )
}

export default function Cuenta() {
  const {
    user,
    getBusinessId,
    isDemoMode,
    businessSettings,
    hasFeature,
    isBusinessOwner,
    isAdmin,
    updateDisplayName,
  } = useAppContext()
  const toast = useToast()
  // Dos instancias: cada sección tiene su propio Guardar, y "Guardando..."
  // debe salir solo en el botón que se apretó.
  const { guardar: guardarPrivacidad, guardando: guardandoPrivacidad } = useGuardado()
  const { guardar: guardarNotificaciones, guardando: guardandoNotificaciones } = useGuardado()

  // `getBusinessId` y `hasFeature` se recrean en cada render del provider: los
  // efectos dependen del ID (un string) y de booleanos, nunca de esas funciones.
  const businessId = getBusinessId()
  const puedeCambiarContrasena = Boolean(isBusinessOwner || isAdmin)
  // La misma condición con la que Settings.jsx mostraba la pestaña Limpieza:
  // el feature (o desarrollo) Y ser dueño o administrador. Un sub-usuario no
  // tiene por qué ver siquiera la puerta de un borrado masivo.
  const mostrarZonaPeligro = Boolean(
    ((hasFeature && hasFeature('bulkDelete')) || import.meta.env.DEV) && (isBusinessOwner || isAdmin),
  )

  // ── Tu cuenta ──────────────────────────────────────────────────────────────
  // Nombre de la cuenta (displayName de Firebase Auth): es el que se ve en la cabecera.
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [savingDisplayName, setSavingDisplayName] = useState(false)
  useEffect(() => {
    if (user?.displayName) setDisplayNameInput(user.displayName)
  }, [user?.displayName])
  const handleSaveDisplayName = async () => {
    const name = displayNameInput.trim()
    if (!name) { toast.error('Ingresa un nombre'); return }
    if (isDemoMode || !updateDisplayName) { toast.error('No disponible en este modo'); return }
    setSavingDisplayName(true)
    try {
      const res = await updateDisplayName(name)
      if (res?.success) toast.success('Nombre actualizado correctamente')
      else toast.error(res?.error || 'No se pudo actualizar el nombre')
    } catch {
      toast.error('No se pudo actualizar el nombre')
    } finally {
      setSavingDisplayName(false)
    }
  }

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Cambio de contraseña: reautentica con la actual antes de escribir la nueva.
  const handleChangePassword = async (e) => {
    e.preventDefault()

    // MODO DEMO: No permitir cambios
    if (isDemoMode) {
      toast.error('No se pueden cambiar contraseñas en modo demo. Crea una cuenta para gestionar tu seguridad.')
      return
    }

    if (!user) return

    // Validaciones
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Todos los campos son requeridos')
      return
    }

    if (newPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    if (currentPassword === newPassword) {
      toast.error('La nueva contraseña debe ser diferente a la actual')
      return
    }

    setIsChangingPassword(true)

    try {
      // Reautenticar al usuario con su contraseña actual
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(auth.currentUser, credential)

      // Actualizar la contraseña
      await updatePassword(auth.currentUser, newPassword)

      // Limpiar campos
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      toast.success('Contraseña actualizada exitosamente')
    } catch (error) {
      console.error('Error al cambiar contraseña:', error)

      // Mensajes de error específicos
      if (error.code === 'auth/wrong-password') {
        toast.error('La contraseña actual es incorrecta')
      } else if (error.code === 'auth/weak-password') {
        toast.error('La nueva contraseña es muy débil')
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error('Por seguridad, debes cerrar sesión y volver a iniciar para cambiar tu contraseña')
      } else {
        toast.error('Error al cambiar la contraseña. Inténtalo nuevamente.')
      }
    } finally {
      setIsChangingPassword(false)
    }
  }

  // ── Qué ven los usuarios secundarios + Notificaciones ──────────────────────
  const [hideDashboardDataFromSecondary, setHideDashboardDataFromSecondary] = useState(false)
  const [showOnlyOwnSalesToSecondary, setShowOnlyOwnSalesToSecondary] = useState(false)
  // El dueño/admin siempre ve el "Efectivo esperado"; esto oculta el monto al cajero.
  const [hideCashExpectedFromCashier, setHideCashExpectedFromCashier] = useState(false)
  const [notificationPreferences, setNotificationPreferences] = useState(PREFERENCIAS_POR_DEFECTO)

  // Se leen del documento UNA sola vez, cuando llega (`businessSettings`
  // arranca en null mientras el contexto lo carga). No se vuelven a
  // sincronizar en cada refresco: guardar una sección refresca el contexto, y
  // si resincronizáramos, pisaría lo que el usuario cambió y aún no guardó en
  // la otra.
  // En demo se sale antes: `useAppContext()` arma `businessSettings` como un
  // objeto literal NUEVO en cada render, y un efecto que dependa de él y haga
  // setState entra en bucle infinito. El ref ya lo frena en la segunda vuelta,
  // pero el corte explícito no depende de que alguien conserve el ref. El demo
  // no trae estos campos de todos modos: quedan los defaults.
  const inicializadoRef = useRef(false)
  useEffect(() => {
    if (isDemoMode || inicializadoRef.current || !businessSettings) return
    inicializadoRef.current = true
    setHideDashboardDataFromSecondary(businessSettings.hideDashboardDataFromSecondary || false)
    setShowOnlyOwnSalesToSecondary(businessSettings.showOnlyOwnSalesToSecondary || false)
    if (businessSettings.hideCashExpectedFromCashier !== undefined) {
      setHideCashExpectedFromCashier(businessSettings.hideCashExpectedFromCashier)
    }
    if (businessSettings.notificationPreferences) {
      setNotificationPreferences(prev => ({ ...prev, ...businessSettings.notificationPreferences }))
    }
  }, [businessSettings, isDemoMode])

  // ── Detector de pagos Yape ─────────────────────────────────────────────────
  const [yapeConfig, setYapeConfig] = useState({
    enabled: false,
    notifyAllUsers: true,
    notifyUsers: [],
    autoStartListening: true,
  })
  const [businessUsers, setBusinessUsers] = useState([])
  const [isSavingYape, setIsSavingYape] = useState(false)
  const [isLoadingYape, setIsLoadingYape] = useState(false)

  // Cargar la configuración de Yape y los usuarios del negocio al entrar.
  // Depende de `user?.uid` y no del objeto `user`: guardar el nombre en la
  // cabecera reemplaza ese objeto, y con él en las dependencias se volvería a
  // leer Firestore y se perdería lo que el usuario cambió acá sin guardar.
  useEffect(() => {
    const loadYapeSettings = async () => {
      if (!user?.uid || isDemoMode || !businessId) return

      setIsLoadingYape(true)
      try {
        // Cargar configuración de Yape
        const configResult = await getYapeConfig(businessId)
        if (configResult.success) {
          setYapeConfig(configResult.data)
        }

        // Cargar usuarios del negocio desde múltiples fuentes
        let users = []
        const userIds = new Set()

        // 1. Buscar usuarios con businessId igual
        const usersSnapshot = await getDocs(
          query(
            collection(db, 'users'),
            where('businessId', '==', businessId)
          )
        )
        usersSnapshot.docs.forEach(d => {
          if (!userIds.has(d.id)) {
            userIds.add(d.id)
            users.push({ id: d.id, ...d.data() })
          }
        })

        // 2. También buscar en businesses/{businessId}/users (colección anidada)
        try {
          const nestedUsersSnapshot = await getDocs(
            collection(db, 'businesses', businessId, 'users')
          )
          for (const userDoc of nestedUsersSnapshot.docs) {
            const userId = userDoc.data().userId || userDoc.id
            if (!userIds.has(userId)) {
              userIds.add(userId)
              // Obtener datos completos del usuario
              const fullUserDoc = await getDoc(doc(db, 'users', userId))
              if (fullUserDoc.exists()) {
                users.push({ id: userId, ...fullUserDoc.data() })
              } else {
                users.push({ id: userId, ...userDoc.data() })
              }
            }
          }
        } catch (e) {
          console.log('No hay colección anidada de usuarios:', e.message)
        }

        // 3. Agregar al dueño del negocio
        const businessDoc = await getDoc(doc(db, 'businesses', businessId))
        if (businessDoc.exists()) {
          const business = businessDoc.data()
          const ownerId = business.ownerId || businessId

          if (!userIds.has(ownerId)) {
            userIds.add(ownerId)
            const ownerDoc = await getDoc(doc(db, 'users', ownerId))
            if (ownerDoc.exists()) {
              users.unshift({
                id: ownerId,
                ...ownerDoc.data(),
                isOwner: true
              })
            }
          } else {
            // Marcar al dueño como tal
            const ownerIndex = users.findIndex(u => u.id === ownerId)
            if (ownerIndex >= 0) {
              users[ownerIndex].isOwner = true
            }
          }
        }

        // 4. Si el usuario actual no está en la lista, agregarlo
        if (user?.uid && !userIds.has(user.uid)) {
          const currentUserDoc = await getDoc(doc(db, 'users', user.uid))
          if (currentUserDoc.exists()) {
            users.push({ id: user.uid, ...currentUserDoc.data(), isCurrent: true })
          }
        }

        setBusinessUsers(users)
      } catch (error) {
        console.error('Error al cargar config Yape:', error)
      } finally {
        setIsLoadingYape(false)
      }
    }

    loadYapeSettings()
  }, [user?.uid, isDemoMode, businessId])

  // Guardar la configuración de Yape. Va a su subdocumento, no al documento
  // del negocio: es la excepción prevista al `useGuardado` de la pestaña.
  const handleSaveYapeConfig = async () => {
    if (isDemoMode) {
      toast.error('No se puede modificar en modo demo')
      return
    }

    if (!businessId) {
      toast.error('No se encontró el ID del negocio')
      return
    }

    setIsSavingYape(true)
    try {
      // Guardar directamente en Firestore
      const configRef = doc(db, 'businesses', businessId, 'settings', 'yapeNotifications')

      await setDoc(configRef, {
        enabled: yapeConfig.enabled ?? false,
        notifyUsers: yapeConfig.notifyUsers || [],
        notifyAllUsers: yapeConfig.notifyAllUsers ?? true,
        autoStartListening: yapeConfig.autoStartListening ?? true,
        updatedAt: serverTimestamp()
      }, { merge: true })

      toast.success('Configuración de Yape guardada')
    } catch (error) {
      console.error('Error al guardar config Yape:', error)
      toast.error(`Error: ${error.message}`)
    } finally {
      setIsSavingYape(false)
    }
  }

  // ── Zona de peligro ────────────────────────────────────────────────────────
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [bulkDeleteType, setBulkDeleteType] = useState(null) // una clave de bulkDeleteLabels
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('')
  const [bulkDeletePassword, setBulkDeletePassword] = useState('')
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({ deleted: 0, total: 0, percentage: 0 })
  const [bulkDeleteCounts, setBulkDeleteCounts] = useState(CONTEOS_EN_CERO)

  // La misma función cuenta al entrar y recuenta después de cada borrado. Había
  // una copia que contaba 8 colecciones en vez de 10, así que "Limpiar stock de
  // insumos" abría deshabilitado hasta que se ejecutara otro borrado.
  const loadBulkDeleteCounts = useCallback(async () => {
    if (!mostrarZonaPeligro || !businessId) return
    const [products, customers, suppliers, invoices, purchases, stockMovements, dispatchGuides, quotations, ingredients, productions] = await Promise.all([
      countDocuments(businessId, 'products'),
      countDocuments(businessId, 'customers'),
      countDocuments(businessId, 'suppliers'),
      countDocuments(businessId, 'invoices'),
      countDocuments(businessId, 'purchases'),
      countDocuments(businessId, 'stockMovements'),
      countDocuments(businessId, 'dispatchGuides'),
      countDocuments(businessId, 'quotations'),
      countDocuments(businessId, 'ingredients'),
      countDocuments(businessId, 'productions'),
    ])
    setBulkDeleteCounts({ products, customers, suppliers, invoices, purchases, stockMovements, dispatchGuides, quotations, ingredients, productions })
  }, [mostrarZonaPeligro, businessId])

  // Contar al entrar. `mostrarZonaPeligro` está en las dependencias (a través
  // del callback) porque `isBusinessOwner` puede llegar después del montaje.
  useEffect(() => {
    loadBulkDeleteCounts()
  }, [loadBulkDeleteCounts])

  const openBulkDeleteModal = (type) => {
    setBulkDeleteType(type)
    setBulkDeleteConfirmText('')
    setBulkDeletePassword('')
    setBulkDeleteProgress({ deleted: 0, total: 0, percentage: 0 })
    setShowBulkDeleteModal(true)
  }

  const executeBulkDelete = async () => {
    // Se comprueba acá y no solo al mostrar la sección: la sección es
    // presentación, esto es lo que borra.
    if (!(isBusinessOwner || isAdmin)) {
      toast.error('Solo el dueño del negocio puede eliminar datos en masa')
      return
    }
    if (SOLO_ADMINISTRADOR.includes(bulkDeleteType) && !isAdmin) {
      toast.error('Los comprobantes y guías emitidos no se pueden eliminar desde acá. Escríbenos a soporte.')
      return
    }
    if (bulkDeleteConfirmText !== 'ELIMINAR') {
      toast.error('Debes escribir ELIMINAR para confirmar')
      return
    }
    if (!bulkDeletePassword) {
      toast.error('Escribe tu contraseña para confirmar')
      return
    }

    // Reautenticación, igual que para cambiar la contraseña: escribir ELIMINAR
    // lo puede hacer cualquiera que encuentre la sesión abierta.
    try {
      const credential = EmailAuthProvider.credential(user.email, bulkDeletePassword)
      await reauthenticateWithCredential(auth.currentUser, credential)
    } catch (error) {
      console.error('Reautenticación para borrado masivo:', error)
      toast.error(
        error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential'
          ? 'La contraseña es incorrecta'
          : 'No se pudo verificar tu contraseña. Cierra sesión, vuelve a entrar e inténtalo de nuevo.',
      )
      return
    }

    setIsBulkDeleting(true)

    try {
      let result
      const onProgress = (progress) => setBulkDeleteProgress(progress)

      switch (bulkDeleteType) {
        case 'products':
          result = await deleteAllProducts(businessId, onProgress)
          break
        case 'customers':
          result = await deleteAllCustomers(businessId, onProgress)
          break
        case 'suppliers':
          result = await deleteAllSuppliers(businessId, onProgress)
          break
        case 'invoices':
          result = await deleteAllInvoices(businessId, onProgress)
          break
        case 'purchases':
          result = await deleteAllPurchases(businessId, onProgress)
          break
        case 'stockMovements':
          result = await deleteAllStockMovements(businessId, onProgress)
          break
        case 'dispatchGuides':
          result = await deleteAllDispatchGuides(businessId, onProgress)
          break
        case 'quotations':
          result = await deleteAllQuotations(businessId, onProgress)
          break
        case 'resetStock': {
          // Paso 1: Resetear stock, lotes y vencimientos en todos los productos
          const resetResult = await resetAllStock(businessId, onProgress)
          if (!resetResult.success) {
            result = resetResult
            break
          }
          // Paso 2: Eliminar todos los movimientos de stock
          const movementsResult = await deleteAllStockMovements(businessId, onProgress)
          result = {
            success: movementsResult.success,
            deleted: resetResult.deleted,
            error: movementsResult.error,
            movementsDeleted: movementsResult.deleted,
          }
          break
        }
        case 'resetIngredientStock': {
          // Paso 1: Resetear stock de todos los insumos (sin eliminarlos)
          const resetResult = await resetAllIngredientStock(businessId, onProgress)
          if (!resetResult.success) {
            result = resetResult
            break
          }
          // Paso 2: Eliminar SOLO los movimientos de insumos (isIngredient == true)
          const movementsResult = await deleteIngredientStockMovements(businessId, onProgress)
          // Paso 3: Eliminar todas las producciones
          const productionsResult = await deleteAllProductions(businessId, onProgress)
          result = {
            success: movementsResult.success && productionsResult.success,
            deleted: resetResult.deleted,
            error: movementsResult.error || productionsResult.error,
            movementsDeleted: movementsResult.deleted,
            productionsDeleted: productionsResult.deleted,
          }
          break
        }
        default:
          throw new Error('Tipo de eliminación no válido')
      }

      if (result.success) {
        const label = bulkDeleteLabels[bulkDeleteType]
        if (label.successMessage) {
          toast.success(label.successMessage.replace('{count}', result.deleted))
        } else {
          toast.success(`${result.deleted} ${label.name.toLowerCase()} eliminados correctamente`)
        }
        setShowBulkDeleteModal(false)
        loadBulkDeleteCounts() // Recargar conteos
      } else {
        toast.error(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error en eliminación masiva:', error)
      toast.error(`Error: ${error.message}`)
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const tituloDelModal = `${bulkDeleteType && bulkDeleteLabels[bulkDeleteType]?.actionVerb === 'limpiar' ? 'Limpiar' : 'Eliminar'} ${bulkDeleteType ? bulkDeleteLabels[bulkDeleteType]?.name : ''}`

  return (
    <div className="space-y-8">
      {/* ── Tu cuenta ── */}
      <Seccion
        id="cuenta"
        titulo="Tu cuenta"
        descripcion="El correo con el que entras, el nombre que se ve en la cabecera y tu contraseña."
      >
        <div className="space-y-4">
          <Campo etiqueta="Correo electrónico">
            <p className="text-sm text-gray-900 py-2">{user?.email}</p>
          </Campo>

          <Campo
            etiqueta="Nombre en la cabecera"
            ayuda="Es tu nombre como usuario, no el de la empresa: aparece arriba, junto al menú."
          >
            <div className="flex flex-col sm:flex-row gap-2 sm:max-w-md">
              <Input
                type="text"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                placeholder={user?.email?.split('@')[0] || 'Tu nombre'}
                disabled={isDemoMode}
              />
              <Button
                type="button"
                onClick={handleSaveDisplayName}
                disabled={savingDisplayName || isDemoMode || !displayNameInput.trim() || displayNameInput.trim() === (user?.displayName || '')}
                className="shrink-0"
              >
                {savingDisplayName ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </Campo>

          {/* Cambio de contraseña: solo el dueño/admin del negocio. Los usuarios
              secundarios NO pueden cambiar su contraseña; la gestiona el administrador. */}
          {puedeCambiarContrasena ? (
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md pt-2">
              <p className="text-sm font-medium text-gray-900">Cambiar contraseña</p>
              <CampoContrasena
                etiqueta="Contraseña actual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                visible={showCurrentPassword}
                onToggle={() => setShowCurrentPassword(!showCurrentPassword)}
                placeholder="Ingresa tu contraseña actual"
                autoComplete="current-password"
              />
              <CampoContrasena
                etiqueta="Nueva contraseña"
                ayuda="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                visible={showNewPassword}
                onToggle={() => setShowNewPassword(!showNewPassword)}
                placeholder="Ingresa tu nueva contraseña"
                autoComplete="new-password"
                minLength={6}
              />
              <CampoContrasena
                etiqueta="Confirmar nueva contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
                placeholder="Confirma tu nueva contraseña"
                autoComplete="new-password"
                minLength={6}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cambiando contraseña...
                    </>
                  ) : (
                    'Cambiar contraseña'
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <Nota>
              El cambio de contraseña está deshabilitado para usuarios secundarios.
              Si necesitas restablecer tu contraseña, contacta al administrador de tu cuenta.
            </Nota>
          )}
        </div>
      </Seccion>

      <Separador />

      {/* ── Qué ven los usuarios secundarios ── */}
      <Seccion
        id="usuarios-secundarios"
        titulo="Qué ven los usuarios secundarios"
        descripcion="Aplica a los usuarios que creaste en Gestión de Usuarios. Tú como dueño y los administradores siempre ven todo."
      >
        <Ajuste
          id="opcion-hideDashboardDataFromSecondary"
          checked={hideDashboardDataFromSecondary}
          onChange={(e) => setHideDashboardDataFromSecondary(e.target.checked)}
          titulo="Ocultar totales y datos sensibles a usuarios secundarios"
          descripcion="Por defecto no ven el dashboard, ni los totales de Ventas, ni los costos y valores de Inventario y Productos, y no pueden exportar a Excel. Puedes darle acceso a alguien en particular desde Gestión de Usuarios, en Qué datos puede ver. Excepción: la página de Contabilidad no se ve afectada; quien tenga acceso a ella (tu contador) podrá descargar el reporte en Excel, los XML y los CDR."
        />
        <Ajuste
          id="opcion-showOnlyOwnSalesToSecondary"
          checked={showOnlyOwnSalesToSecondary}
          onChange={(e) => setShowOnlyOwnSalesToSecondary(e.target.checked)}
          titulo="Cada usuario secundario ve solo las ventas que él registró"
          descripcion="En Ventas, Reportes y Dashboard cada sub-usuario ve únicamente los comprobantes que emitió él. Apagado, ve las ventas de todas las sucursales que le asignaste, sin importar quién las registró. Los comprobantes emitidos antes de que existiera el registro de autor quedan ocultos para los sub-usuarios."
        />
        <Ajuste
          id="opcion-hideCashExpectedFromCashier"
          checked={hideCashExpectedFromCashier}
          onChange={(e) => setHideCashExpectedFromCashier(e.target.checked)}
          titulo='Ocultar "Efectivo esperado" del cierre de caja a sub-usuarios'
          descripcion="Los cajeros no ven el monto que debería haber ni la diferencia (sobrante o faltante): solo cuentan e ingresan lo que tienen, y tú comparas después. Tú como dueño o administrador sí lo ves."
        />
        <BarraGuardar
          onClick={() => guardarPrivacidad(
            { hideDashboardDataFromSecondary, showOnlyOwnSalesToSecondary, hideCashExpectedFromCashier },
            'Privacidad guardada',
          )}
          guardando={guardandoPrivacidad}
        />
      </Seccion>

      <Separador />

      {/* ── Notificaciones ── */}
      <Seccion
        id="notificaciones"
        titulo="Notificaciones"
        descripcion="Avisos push al celular con la app instalada. Los avisos de suscripción (vencimiento, renovación) no se pueden apagar: hacen falta para que la cuenta siga funcionando."
      >
        <Nota>Cada usuario secundario elige además las suyas en Gestión de Usuarios.</Nota>
        {NOTIFICACIONES.map((item) => (
          <Ajuste
            key={item.key}
            id={`opcion-notificationPreferences.${item.key}`}
            checked={notificationPreferences[item.key]}
            onChange={(e) => setNotificationPreferences(prev => ({ ...prev, [item.key]: e.target.checked }))}
            titulo={item.titulo}
            descripcion={item.descripcion}
          />
        ))}
        <BarraGuardar
          onClick={() => guardarNotificaciones({ notificationPreferences }, 'Preferencias de notificaciones guardadas')}
          guardando={guardandoNotificaciones}
        />
      </Seccion>

      <Separador />

      {/* ── Detector de pagos Yape ── */}
      <Seccion
        id="yape"
        titulo="Detector de pagos Yape"
        descripcion="La app instalada en el celular que recibe los Yapes lee la notificación del pago y avisa por push a quien elijas."
      >
        <Ajuste
          id="opcion-yapeConfig.enabled"
          checked={yapeConfig.enabled}
          onChange={(e) => setYapeConfig(prev => ({ ...prev, enabled: e.target.checked }))}
          titulo="Detectar pagos por Yape"
          descripcion="Detecta automáticamente cuando recibes un pago por Yape y envía notificaciones push a los usuarios que selecciones."
        />

        {yapeConfig.enabled && (
          <>
            <Ajuste
              id="opcion-yapeConfig.autoStartListening"
              checked={yapeConfig.autoStartListening}
              onChange={(e) => setYapeConfig(prev => ({ ...prev, autoStartListening: e.target.checked }))}
              titulo="Iniciar automáticamente"
              descripcion="Comenzar a escuchar notificaciones al abrir la app."
            />
            <Ajuste
              id="opcion-yapeConfig.notifyAllUsers"
              checked={yapeConfig.notifyAllUsers}
              onChange={(e) => setYapeConfig(prev => ({ ...prev, notifyAllUsers: e.target.checked }))}
              titulo="Notificar a todos los usuarios"
              descripcion="Enviar notificación push a todos los usuarios del negocio."
            />

            {/* La lista va FUERA del Ajuste (que es un <label>): cada usuario
                es su propio label, así marcar uno no toca el interruptor de arriba. */}
            {!yapeConfig.notifyAllUsers && (
              <div className="p-3 border border-gray-200 rounded-lg">
                <p className="text-sm font-medium text-gray-900 mb-2">Usuarios a notificar</p>
                {isLoadingYape ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : businessUsers.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No hay usuarios registrados en este negocio
                  </p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {businessUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={(yapeConfig.notifyUsers || []).includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setYapeConfig(prev => ({
                                ...prev,
                                notifyUsers: [...(prev.notifyUsers || []), u.id]
                              }))
                            } else {
                              setYapeConfig(prev => ({
                                ...prev,
                                notifyUsers: (prev.notifyUsers || []).filter(id => id !== u.id)
                              }))
                            }
                          }}
                          className="w-4 h-4 shrink-0 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {u.displayName || u.name || u.email}
                            {u.isOwner && <span className="ml-2 text-xs font-normal text-gray-500">(dueño)</span>}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{u.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Antes el botón solo salía con el detector encendido, así que apagarlo
            no se podía guardar. Ahora está siempre. */}
        <BarraGuardar onClick={handleSaveYapeConfig} guardando={isSavingYape} />

        <Nota>
          Hace falta la app instalada en el celular que recibe los Yapes, con el acceso a
          notificaciones concedido (Configuración, Acceso a notificaciones, Cobrify). Solo se leen
          las notificaciones de Yape: se procesan en el dispositivo y se guarda únicamente el monto
          y el nombre de quien pagó.
        </Nota>
        {isAdmin && (
          <Link to="/test-notifications" className="inline-block text-sm font-medium text-primary-600 hover:text-primary-700">
            Abrir página de pruebas
          </Link>
        )}
      </Seccion>

      {/* ── Zona de peligro ── */}
      {mostrarZonaPeligro && (
        <>
          <Separador />

          <Seccion
            id="zona-de-peligro"
            titulo="Zona de peligro"
            descripcion="Selecciona qué datos deseas eliminar. Cada acción requiere confirmación."
          >
            <Nota tono="peligro" titulo="Las acciones de esta sección son irreversibles">
              Una vez eliminados los datos no se pueden recuperar. Asegúrate de tener respaldos antes de continuar.
            </Nota>

            {FILAS_BORRADO.map(({ tipo, titulo, descripcion, avisoSoloAdmin }) => {
              const bloqueadoParaElNegocio = SOLO_ADMINISTRADOR.includes(tipo) && !isAdmin
              return (
                <FilaPeligro
                  key={tipo}
                  titulo={titulo}
                  onClick={() => openBulkDeleteModal(tipo)}
                  disabled={bulkDeleteCounts[tipo] === 0 || bloqueadoParaElNegocio}
                  title={bloqueadoParaElNegocio ? avisoSoloAdmin : undefined}
                >
                  {descripcion}
                  {bulkDeleteCounts[tipo] > 0 && (
                    <span className="ml-1 font-medium text-gray-700">({bulkDeleteCounts[tipo]} registros)</span>
                  )}
                </FilaPeligro>
              )
            })}

            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide pt-3">
              Reinicio de inventario
            </p>

            {/* Limpiar stock e inventario (sin eliminar productos) */}
            <FilaPeligro
              titulo="Limpiar stock e inventario"
              onClick={() => openBulkDeleteModal('resetStock')}
              disabled={bulkDeleteCounts.products === 0}
            >
              Resetea a <strong>cero</strong> el stock, los lotes y los vencimientos de todos los productos, y elimina el historial de movimientos.
              Los productos NO se eliminan: ideal antes de re-importar stock desde Excel.
              {bulkDeleteCounts.products > 0 && (
                <span className="block mt-1 text-gray-700">
                  Afectará a <strong>{bulkDeleteCounts.products}</strong> productos
                  {bulkDeleteCounts.stockMovements > 0 && (
                    <> y eliminará <strong>{bulkDeleteCounts.stockMovements}</strong> movimientos</>
                  )}.
                </span>
              )}
            </FilaPeligro>

            {/* Limpiar stock de insumos (sin eliminar insumos) + producciones */}
            <FilaPeligro
              titulo="Limpiar stock de insumos"
              onClick={() => openBulkDeleteModal('resetIngredientStock')}
              disabled={bulkDeleteCounts.ingredients === 0}
            >
              Resetea a <strong>cero</strong> el stock de todos los insumos, elimina sus movimientos y borra el listado de producción.
              Los insumos NO se eliminan: ideal antes de rehacer el inventario de insumos.
              {bulkDeleteCounts.ingredients > 0 && (
                <span className="block mt-1 text-gray-700">
                  Afectará a <strong>{bulkDeleteCounts.ingredients}</strong> insumos
                  {bulkDeleteCounts.productions > 0 && (
                    <> y eliminará <strong>{bulkDeleteCounts.productions}</strong> producciones</>
                  )}.
                </span>
              )}
            </FilaPeligro>

            <Nota titulo="Cada eliminación pide dos confirmaciones">
              Escribir ELIMINAR y tu contraseña. Los comprobantes y las guías de remisión
              ya emitidos no se eliminan desde acá: SUNAT obliga a conservarlos.
            </Nota>
          </Seccion>

          {/* Modal: confirmación de eliminación masiva */}
          <Modal
            isOpen={showBulkDeleteModal}
            onClose={() => !isBulkDeleting && setShowBulkDeleteModal(false)}
            title={tituloDelModal}
            maxWidth="md"
          >
            <div className="space-y-4">
              <Nota tono="peligro" titulo="Esta acción es irreversible">
                {bulkDeleteType === 'resetStock' ? (
                  <p>
                    Vas a <strong>resetear a cero</strong> el stock, los lotes y los vencimientos de <strong>todos</strong> los productos,
                    y <strong>eliminar</strong> todo el historial de movimientos de stock.
                    <strong> Los productos no se eliminarán</strong>, solo se limpia su inventario.
                    Úsalo antes de re-importar stock desde Excel.
                  </p>
                ) : bulkDeleteType === 'resetIngredientStock' ? (
                  <p>
                    Vas a <strong>resetear a cero</strong> el stock de <strong>todos</strong> los insumos,
                    <strong> eliminar</strong> sus movimientos de stock y <strong>borrar</strong> todo el listado de producción.
                    <strong> Los insumos no se eliminarán</strong>, solo se limpia su inventario.
                  </p>
                ) : (
                  <p>
                    Estás a punto de eliminar <strong>todos</strong> los {bulkDeleteType ? bulkDeleteLabels[bulkDeleteType]?.name.toLowerCase() : ''}.
                    Esta acción no se puede deshacer.
                  </p>
                )}
              </Nota>

              {!isBulkDeleting ? (
                <div className="space-y-4">
                  <Campo etiqueta="Para confirmar, escribe ELIMINAR">
                    <Input
                      type="text"
                      value={bulkDeleteConfirmText}
                      onChange={(e) => setBulkDeleteConfirmText(e.target.value.toUpperCase())}
                      placeholder="Escribe ELIMINAR"
                      className="text-center font-mono text-lg"
                    />
                  </Campo>
                  <Campo etiqueta="Y tu contraseña">
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={bulkDeletePassword}
                      onChange={(e) => setBulkDeletePassword(e.target.value)}
                      placeholder="Contraseña de tu cuenta"
                    />
                  </Campo>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-gray-700">
                    <span>Progreso:</span>
                    <span className="font-medium tabular-nums">{bulkDeleteProgress.deleted} / {bulkDeleteProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-red-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${bulkDeleteProgress.percentage}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 text-center">
                    Eliminando... Por favor no cierres esta ventana.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={isBulkDeleting}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={executeBulkDelete}
                  disabled={bulkDeleteConfirmText !== 'ELIMINAR' || !bulkDeletePassword || isBulkDeleting}
                  className="flex-1"
                >
                  {isBulkDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar todo
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {/* Qué versión está corriendo. En el celular son dos: la de la tienda y
          la web que va dentro. Sirve para soporte. */}
      <Seccion
        titulo="Versión"
        descripcion="Si escribes a soporte, este dato ayuda a saber qué versión estás usando."
      >
        <VersionApp />
      </Seccion>
    </div>
  )
}
