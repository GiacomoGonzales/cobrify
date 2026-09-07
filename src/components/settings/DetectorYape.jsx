/**
 * DETECTOR DE PAGOS YAPE.
 *
 * Vivía dentro de "Cuenta y seguridad", que no es su sitio: es una integración
 * con una app de fuera, igual que Rappi o Shopifree, y era la sección más
 * larga de una página que va de identidad y permisos. Se movió a Integraciones
 * el 2026-09-07, entera y en su propio componente.
 *
 * Guarda en el subdocumento `businesses/{id}/settings/yapeNotifications` con su
 * propio setDoc, no en el documento del negocio: es lo que leen `yapeService` y
 * la app nativa. Por eso no pasa por el `useGuardado` de la pestaña — es la
 * excepción prevista, no un descuido.
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { Seccion, Ajuste, Nota, BarraGuardar } from '@/components/settings/kit'
import { getYapeConfig } from '@/services/yapeService'

export default function DetectorYape() {
  const { user, getBusinessId, isDemoMode, isAdmin } = useAppContext()
  const toast = useToast()
  const businessId = getBusinessId()

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

  return (
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
  )
}
