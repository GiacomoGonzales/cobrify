import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Trash2,
  AlertCircle,
  Clock,
  CreditCard,
  Gift,
  Sparkles,
  Wallet
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getUserNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  NOTIFICATION_TYPES
} from '@/services/notificationService';

export default function NotificationPanel({ userId, isOpen, onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Cargar notificaciones
  const loadNotifications = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const [allNotifications, unreadNotifications] = await Promise.all([
        getUserNotifications(userId, 20),
        getUnreadNotifications(userId)
      ]);

      setNotifications(allNotifications);
      setUnreadCount(unreadNotifications.length);
    } catch (error) {
      console.error('Error al cargar notificaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, userId]);

  // Marcar como leída
  const handleMarkAsRead = async (notificationId) => {
    try {
      await markAsRead(notificationId);
      await loadNotifications();
    } catch (error) {
      console.error('Error al marcar como leída:', error);
    }
  };

  // Marcar todas como leídas
  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead(userId);
      await loadNotifications();
    } catch (error) {
      console.error('Error al marcar todas como leídas:', error);
    }
  };

  // Eliminar notificación
  const handleDelete = async (notificationId) => {
    try {
      await deleteNotification(notificationId);
      await loadNotifications();
    } catch (error) {
      console.error('Error al eliminar notificación:', error);
    }
  };

  // Obtener icono según tipo
  const getNotificationIcon = (type) => {
    switch (type) {
      case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING_SOON:
        return <Clock className="w-5 h-5 text-orange-500" />;
      case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED:
        return <CheckCheck className="w-5 h-5 text-green-500" />;
      case NOTIFICATION_TYPES.PAYMENT_RECEIVED:
        return <CreditCard className="w-5 h-5 text-blue-500" />;
      case NOTIFICATION_TYPES.PLAN_CHANGED:
        return <Gift className="w-5 h-5 text-purple-500" />;
      case NOTIFICATION_TYPES.WELCOME:
        return <Sparkles className="w-5 h-5 text-yellow-500" />;
      case NOTIFICATION_TYPES.YAPE_PAYMENT:
        return <Wallet className="w-5 h-5 text-purple-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  // Obtener color de fondo según tipo
  const getNotificationBgColor = (type, isRead) => {
    if (isRead) return 'bg-white';

    switch (type) {
      case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING_SOON:
        return 'bg-orange-50';
      case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
        return 'bg-red-50';
      case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED:
        return 'bg-green-50';
      case NOTIFICATION_TYPES.PAYMENT_RECEIVED:
        return 'bg-blue-50';
      case NOTIFICATION_TYPES.YAPE_PAYMENT:
        return 'bg-purple-50';
      default:
        return 'bg-gray-50';
    }
  };

  // Manejar click en notificación
  const handleNotificationClick = async (notification) => {
    // Marcar como leída
    if (!notification.read) {
      await handleMarkAsRead(notification.id);
    }

    // Navegar según el tipo
    if (
      notification.type === NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING_SOON ||
      notification.type === NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED ||
      notification.type === NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED ||
      notification.type === NOTIFICATION_TYPES.PAYMENT_RECEIVED ||
      notification.type === NOTIFICATION_TYPES.PLAN_CHANGED
    ) {
      navigate('/mi-suscripcion');
      onClose();
    } else if (notification.type === NOTIFICATION_TYPES.YAPE_PAYMENT) {
      // Navegar al POS para usar el pago Yape
      navigate('/pos');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay para cerrar al hacer click fuera */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Panel de notificaciones */}
      <div className="fixed sm:absolute right-0 sm:right-0 top-16 sm:top-full left-0 sm:left-auto sm:mt-2 w-full sm:w-96 bg-white sm:rounded-lg shadow-xl border-t sm:border border-gray-200 z-50 max-h-[calc(100vh-4rem)] sm:max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-700" />
            <h3 className="font-semibold text-gray-900">Notificaciones</h3>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Acciones */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-200 flex justify-end">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                <CheckCheck className="w-4 h-4" />
                Marcar todas como leídas
              </button>
            )}
          </div>
        )}

        {/* Lista de notificaciones */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-gray-500">
              <Bell className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm">No tienes notificaciones</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notification) => {
                const createdAt = notification.createdAt?.toDate?.() || notification.createdAt;

                return (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${getNotificationBgColor(notification.type, notification.read)}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3">
                      {/* Icono */}
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Contenido */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`text-sm font-semibold ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0 mt-1"></div>
                          )}
                        </div>
                        <p className={`text-sm mt-1 ${notification.read ? 'text-gray-500' : 'text-gray-700'}`}>
                          {notification.message}
                        </p>
                        {createdAt && (
                          <p className="text-xs text-gray-400 mt-2">
                            {format(new Date(createdAt), "dd/MM/yyyy HH:mm", { locale: es })}
                          </p>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex-shrink-0 flex flex-col gap-1">
                        {!notification.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(notification.id);
                            }}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Marcar como leída"
                          >
                            <Check className="w-4 h-4 text-gray-600" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(notification.id);
                          }}
                          className="p-1 hover:bg-red-100 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4 text-gray-600 hover:text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
