import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  deleteDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';

// Tipos de notificaciones
export const NOTIFICATION_TYPES = {
  SUBSCRIPTION_EXPIRING_SOON: 'subscription_expiring_soon', // Vence en 7 días o menos
  SUBSCRIPTION_EXPIRED: 'subscription_expired', // Ya venció
  SUBSCRIPTION_RENEWED: 'subscription_renewed', // Se renovó la suscripción
  PAYMENT_RECEIVED: 'payment_received', // Se recibió un pago
  PLAN_CHANGED: 'plan_changed', // Se cambió el plan
  WELCOME: 'welcome', // Bienvenida al sistema
  NEW_SALE: 'new_sale', // Nueva venta realizada
  LOW_STOCK: 'low_stock', // Producto con stock bajo
  OUT_OF_STOCK: 'out_of_stock', // Producto sin stock
};

// ===========================================
// PUSH NOTIFICATIONS (FCM)
// ===========================================

// Variable para evitar registrar listeners múltiples veces
let listenersRegistered = false;

// Inicializar notificaciones push para el usuario
export const initializePushNotifications = async (userId) => {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  if (!isNative) {
    console.log('Push notifications only available on native platforms');
    return { success: false, error: 'Not native platform' };
  }

  try {
    // 1. Solicitar permisos
    const permissionResult = await PushNotifications.requestPermissions();
    console.log('📋 Permission result:', permissionResult.receive);

    if (permissionResult.receive !== 'granted') {
      console.log('Permission not granted for push notifications');
      return { success: false, error: 'Permission denied' };
    }

    // 2. Registrar para recibir notificaciones
    await PushNotifications.register();

    // 3. Obtener el token FCM (funciona en iOS y Android)
    // En iOS, FCM.getToken() convierte el token APNs a FCM
    // En Android, devuelve el token FCM directamente
    const fcmToken = await FCM.getToken();
    const token = fcmToken.token;

    console.log('✅ Push registration success!');
    console.log('📱 FCM Token:', token);
    console.log('📱 Token length:', token?.length);
    console.log('📱 Platform:', platform);
    console.log('👤 User ID:', userId);

    // Guardar el token en Firestore asociado al usuario
    if (userId && token) {
      const saveResult = await saveFCMToken(userId, token);
      if (saveResult.success) {
        console.log('✅ Token guardado exitosamente en Firestore');
      } else {
        console.error('❌ Error al guardar token:', saveResult.error);
      }
    } else {
      console.error('❌ No userId or token available');
    }

    // 4. Registrar listeners solo una vez
    if (!listenersRegistered) {
      // Escuchar notificaciones recibidas (app en foreground)
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received:', notification);
      });

      // Escuchar cuando el usuario toca una notificación
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push notification action performed:', notification);
      });

      listenersRegistered = true;
    }

    return { success: true, token };
  } catch (error) {
    console.error('Error initializing push notifications:', error);
    return { success: false, error: error.message };
  }
};

// Guardar token FCM en Firestore
export const saveFCMToken = async (userId, token) => {
  try {
    // Detectar plataforma automáticamente
    const platform = Capacitor.getPlatform(); // 'ios', 'android', o 'web'

    const tokenRef = doc(db, 'users', userId, 'fcmTokens', token);
    await setDoc(tokenRef, {
      token,
      platform,
      createdAt: serverTimestamp(),
      lastUsed: serverTimestamp()
    }, { merge: true });

    console.log(`FCM token saved to Firestore (platform: ${platform})`);
    return { success: true };
  } catch (error) {
    console.error('Error saving token to Firestore:', error);
    return { success: false, error: error.message };
  }
};

// Remover todos los listeners cuando el usuario cierra sesión
export const cleanupPushNotifications = async () => {
  const isNative = Capacitor.isNativePlatform();
  if (!isNative) return;

  try {
    await PushNotifications.removeAllListeners();
    listenersRegistered = false; // Resetear la bandera
    console.log('Push notification listeners removed');
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
  }
};

// Crear notificación
export const createNotification = async (userId, type, title, message, metadata = {}) => {
  try {
    const notificationData = {
      userId,
      type,
      title,
      message,
      metadata,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const notificationsRef = collection(db, 'notifications');
    const docRef = await addDoc(notificationsRef, notificationData);

    return { id: docRef.id, ...notificationData };
  } catch (error) {
    console.error('Error al crear notificación:', error);
    throw error;
  }
};

// Obtener notificaciones de un usuario
export const getUserNotifications = async (userId, limitCount = 20) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    // Si el error es por falta de índice, retornar array vacío en lugar de fallar
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      // Solo mostrar warning una vez
      if (!window.__notificationIndexWarningShown) {
        console.warn('⚠️ Índices de Firestore pendientes para notificaciones. Ejecuta: firebase deploy --only firestore:indexes');
        window.__notificationIndexWarningShown = true;
      }
      return [];
    }
    console.error('Error al obtener notificaciones:', error);
    throw error;
  }
};

// Obtener solo notificaciones no leídas
export const getUnreadNotifications = async (userId) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    // Si el error es por falta de índice, retornar array vacío en lugar de fallar
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      // Solo mostrar warning una vez
      if (!window.__notificationIndexWarningShown) {
        console.warn('⚠️ Índices de Firestore pendientes para notificaciones. Ejecuta: firebase deploy --only firestore:indexes');
        window.__notificationIndexWarningShown = true;
      }
      return [];
    }
    console.error('Error al obtener notificaciones no leídas:', error);
    throw error;
  }
};

// Marcar notificación como leída
export const markAsRead = async (notificationId) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      read: true,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error al marcar notificación como leída:', error);
    throw error;
  }
};

// Marcar todas las notificaciones como leídas
export const markAllAsRead = async (userId) => {
  try {
    const unreadNotifications = await getUnreadNotifications(userId);

    const updatePromises = unreadNotifications.map(notification =>
      markAsRead(notification.id)
    );

    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Error al marcar todas como leídas:', error);
    throw error;
  }
};

// Eliminar notificación
export const deleteNotification = async (notificationId) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await deleteDoc(notificationRef);
  } catch (error) {
    console.error('Error al eliminar notificación:', error);
    throw error;
  }
};

// Verificar y crear notificaciones de suscripción
export const checkAndCreateSubscriptionNotifications = async (userId, subscription) => {
  if (!subscription) return;

  const now = new Date();
  const periodEnd = subscription.currentPeriodEnd?.toDate?.() || subscription.currentPeriodEnd;

  if (!periodEnd) return;

  const daysUntilExpiry = Math.ceil((new Date(periodEnd) - now) / (1000 * 60 * 60 * 24));

  // Obtener notificaciones existentes del usuario
  const existingNotifications = await getUserNotifications(userId, 50);

  // Determinar si es prueba gratuita
  const isTrial = subscription.plan === 'trial';

  // Verificar si ya expiró
  if (daysUntilExpiry < 0 && subscription.status === 'active') {
    // Verificar si ya existe notificación de expiración
    const hasExpiredNotification = existingNotifications.some(
      n => n.type === NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED && !n.read
    );

    if (!hasExpiredNotification) {
      await createNotification(
        userId,
        NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
        'Suscripción Vencida',
        `Tu suscripción venció el ${new Date(periodEnd).toLocaleDateString('es-PE')}. Por favor, renueva tu plan para continuar usando el sistema.`,
        { periodEnd, daysOverdue: Math.abs(daysUntilExpiry) }
      );
    }
  }
  // Notificar próximo vencimiento
  else if (daysUntilExpiry >= 0) {
    // Para prueba gratuita: notificar con 7 días o menos
    // Para planes de pago: notificar solo con 1 día o menos
    const shouldNotify = isTrial
      ? daysUntilExpiry <= 7
      : daysUntilExpiry <= 1;

    if (shouldNotify) {
      // Verificar si ya existe notificación de próximo vencimiento
      const hasExpiringNotification = existingNotifications.some(
        n => n.type === NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING_SOON && !n.read
      );

      if (!hasExpiringNotification) {
        const message = isTrial
          ? `Tu prueba gratuita vence ${daysUntilExpiry === 0 ? 'hoy' : `en ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'día' : 'días'}`}. Actualiza a un plan de pago para continuar usando el sistema.`
          : `Tu suscripción vence ${daysUntilExpiry === 0 ? 'hoy' : 'mañana'}. Renueva ahora para evitar interrupciones.`;

        await createNotification(
          userId,
          NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING_SOON,
          isTrial ? 'Prueba Gratuita por Vencer' : 'Suscripción por Vencer',
          message,
          { periodEnd, daysUntilExpiry, isTrial }
        );
      }
    }
  }
};

// Crear notificación de pago recibido
export const notifyPaymentReceived = async (userId, amount, plan, newExpiryDate) => {
  try {
    await createNotification(
      userId,
      NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      'Pago Recibido',
      `Hemos recibido tu pago de S/ ${amount}. Tu suscripción ${plan} ha sido activada hasta el ${new Date(newExpiryDate).toLocaleDateString('es-PE')}.`,
      { amount, plan, newExpiryDate }
    );
  } catch (error) {
    console.error('Error al crear notificación de pago:', error);
  }
};

// Crear notificación de suscripción renovada
export const notifySubscriptionRenewed = async (userId, plan, newExpiryDate) => {
  try {
    await createNotification(
      userId,
      NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED,
      'Suscripción Renovada',
      `Tu suscripción ${plan} ha sido renovada exitosamente. Nueva fecha de vencimiento: ${new Date(newExpiryDate).toLocaleDateString('es-PE')}.`,
      { plan, newExpiryDate }
    );
  } catch (error) {
    console.error('Error al crear notificación de renovación:', error);
  }
};

// Crear notificación de cambio de plan
export const notifyPlanChanged = async (userId, oldPlan, newPlan) => {
  try {
    await createNotification(
      userId,
      NOTIFICATION_TYPES.PLAN_CHANGED,
      'Plan Actualizado',
      `Tu plan ha sido actualizado de ${oldPlan} a ${newPlan}.`,
      { oldPlan, newPlan }
    );
  } catch (error) {
    console.error('Error al crear notificación de cambio de plan:', error);
  }
};

// Crear notificación de bienvenida
export const notifyWelcome = async (userId, userName) => {
  try {
    await createNotification(
      userId,
      NOTIFICATION_TYPES.WELCOME,
      '¡Bienvenido a Cobrify!',
      `Hola ${userName}, gracias por unirte a Cobrify. Tu período de prueba gratuito ha comenzado.`,
      { userName }
    );
  } catch (error) {
    console.error('Error al crear notificación de bienvenida:', error);
  }
};
