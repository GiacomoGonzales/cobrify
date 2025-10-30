import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  getDocs,
  where,
  orderBy,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { notifyPaymentReceived, notifySubscriptionRenewed, notifyPlanChanged, notifyWelcome } from './notificationService';

// Planes disponibles - Pago por adelantado
export const PLANS = {
  trial: {
    name: "Prueba Gratuita",
    months: 0,
    pricePerMonth: 0,
    totalPrice: 0,
    duration: 1, // días
    limits: {
      maxInvoicesPerMonth: -1, // ilimitado
      maxCustomers: -1, // ilimitado
      maxProducts: -1, // ilimitado
      sunatIntegration: false, // Bloqueado en prueba
      multiUser: false
    }
  },
  plan_3_months: {
    name: "Plan 3 Meses",
    months: 3,
    pricePerMonth: 39,
    totalPrice: 117, // 3 x 39
    limits: {
      maxInvoicesPerMonth: -1, // ilimitado
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: false
    }
  },
  plan_6_months: {
    name: "Plan 6 Meses",
    months: 6,
    pricePerMonth: 29,
    totalPrice: 174, // 6 x 29
    limits: {
      maxInvoicesPerMonth: -1, // ilimitado
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: false
    },
    badge: "Popular"
  },
  plan_12_months: {
    name: "Plan 12 Meses (1 Año)",
    months: 12,
    pricePerMonth: 19,
    totalPrice: 228, // 12 x 19
    limits: {
      maxInvoicesPerMonth: -1, // ilimitado
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: true
    },
    badge: "Mejor Precio"
  },
  custom: {
    name: "Plan Personalizado",
    months: 1,
    pricePerMonth: 0,
    totalPrice: 0,
    limits: {
      maxInvoicesPerMonth: -1,
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: false
    }
  }
};

// Obtener suscripción de un usuario
export const getSubscription = async (userId) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionSnap = await getDoc(subscriptionRef);

    if (subscriptionSnap.exists()) {
      return { id: subscriptionSnap.id, ...subscriptionSnap.data() };
    }
    return null;
  } catch (error) {
    console.error('Error al obtener suscripción:', error);
    throw error;
  }
};

// Crear suscripción inicial para un nuevo usuario
export const createSubscription = async (userId, email, businessName, plan = 'trial') => {
  try {
    const planConfig = PLANS[plan];
    const now = new Date();
    const periodEnd = new Date();

    if (plan === 'trial') {
      periodEnd.setDate(now.getDate() + planConfig.duration);
    } else {
      periodEnd.setMonth(now.getMonth() + 1);
    }

    const subscriptionData = {
      userId,
      email,
      businessName,
      plan,
      status: 'active',
      startDate: Timestamp.fromDate(now),
      currentPeriodStart: Timestamp.fromDate(now),
      currentPeriodEnd: Timestamp.fromDate(periodEnd),
      trialEndsAt: plan === 'trial' ? Timestamp.fromDate(periodEnd) : null,
      lastPaymentDate: null,
      nextPaymentDate: Timestamp.fromDate(periodEnd),
      paymentMethod: null,
      monthlyPrice: planConfig.pricePerMonth,
      accessBlocked: false,
      blockReason: null,
      blockedAt: null,
      limits: planConfig.limits,
      usage: {
        invoicesThisMonth: 0,
        totalCustomers: 0,
        totalProducts: 0
      },
      paymentHistory: [],
      notes: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const subscriptionRef = doc(db, 'subscriptions', userId);
    await setDoc(subscriptionRef, subscriptionData);

    // Enviar notificación de bienvenida
    if (plan === 'trial') {
      await notifyWelcome(userId, businessName || email);
    }

    return subscriptionData;
  } catch (error) {
    console.error('Error al crear suscripción:', error);
    throw error;
  }
};

// Verificar si el usuario tiene acceso activo
export const hasActiveAccess = (subscription) => {
  if (!subscription) return false;

  // Verificar que no esté bloqueado
  if (subscription.accessBlocked === true) return false;

  // Verificar que el estado sea activo
  if (subscription.status !== 'active') return false;

  // Verificar que no haya expirado el período
  const now = new Date();
  const periodEnd = subscription.currentPeriodEnd?.toDate?.() || subscription.currentPeriodEnd;

  if (periodEnd && periodEnd < now) return false;

  return true;
};

// Suspender acceso de un usuario (Admin)
export const suspendUser = async (userId, reason = 'Falta de pago') => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    await updateDoc(subscriptionRef, {
      status: 'suspended',
      accessBlocked: true,
      blockReason: reason,
      blockedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error al suspender usuario:', error);
    throw error;
  }
};

// Reactivar acceso de un usuario (Admin)
export const reactivateUser = async (userId, extendDays = 30) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionSnap = await getDoc(subscriptionRef);

    if (!subscriptionSnap.exists()) {
      throw new Error('Suscripción no encontrada');
    }

    const subscription = subscriptionSnap.data();
    const now = new Date();
    const currentPeriodEnd = subscription.currentPeriodEnd?.toDate?.() || subscription.currentPeriodEnd;

    // Si la fecha de vencimiento ya pasó, extender desde HOY
    // Si no, extender desde la fecha de vencimiento actual
    const baseDate = currentPeriodEnd && new Date(currentPeriodEnd) > now
      ? new Date(currentPeriodEnd)
      : now;

    const newPeriodEnd = new Date(baseDate);
    newPeriodEnd.setDate(newPeriodEnd.getDate() + extendDays);

    await updateDoc(subscriptionRef, {
      status: 'active',
      accessBlocked: false,
      blockReason: null,
      blockedAt: null,
      currentPeriodStart: Timestamp.fromDate(now),
      currentPeriodEnd: Timestamp.fromDate(newPeriodEnd),
      nextPaymentDate: Timestamp.fromDate(newPeriodEnd),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error al reactivar usuario:', error);
    throw error;
  }
};

// Registrar pago manual (Admin)
export const registerPayment = async (userId, amount, method = 'Transferencia', selectedPlan = 'plan_3_months') => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionSnap = await getDoc(subscriptionRef);

    if (!subscriptionSnap.exists()) {
      throw new Error('Suscripción no encontrada');
    }

    const subscription = subscriptionSnap.data();
    const now = new Date();
    const currentPeriodEnd = subscription.currentPeriodEnd?.toDate?.() || subscription.currentPeriodEnd;

    // Obtener configuración del plan
    const planConfig = PLANS[selectedPlan];
    const monthsToAdd = planConfig?.months || 3;

    // Si la fecha de vencimiento ya pasó, extender desde HOY
    // Si no, extender desde la fecha de vencimiento actual
    const baseDate = currentPeriodEnd && new Date(currentPeriodEnd) > now
      ? new Date(currentPeriodEnd)
      : now;

    const newPeriodEnd = new Date(baseDate);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + monthsToAdd);

    // Agregar pago al historial
    const paymentRecord = {
      date: Timestamp.fromDate(now),
      amount,
      method,
      plan: selectedPlan,
      planName: planConfig?.name || selectedPlan,
      months: monthsToAdd,
      status: 'completed',
      registeredBy: 'admin'
    };

    const updatedHistory = [...(subscription.paymentHistory || []), paymentRecord];

    await updateDoc(subscriptionRef, {
      plan: selectedPlan,
      status: 'active',
      accessBlocked: false,
      blockReason: null,
      blockedAt: null,
      lastPaymentDate: Timestamp.fromDate(now),
      currentPeriodEnd: Timestamp.fromDate(newPeriodEnd),
      nextPaymentDate: Timestamp.fromDate(newPeriodEnd),
      monthlyPrice: planConfig?.pricePerMonth || 0,
      limits: planConfig?.limits || subscription.limits,
      paymentHistory: updatedHistory,
      updatedAt: serverTimestamp()
    });

    // Enviar notificación al usuario
    await notifyPaymentReceived(userId, amount, planConfig?.name || selectedPlan, newPeriodEnd);
  } catch (error) {
    console.error('Error al registrar pago:', error);
    throw error;
  }
};

// Cambiar plan de un usuario (Admin)
export const changePlan = async (userId, newPlan) => {
  try {
    if (!PLANS[newPlan]) {
      throw new Error('Plan no válido');
    }

    const planConfig = PLANS[newPlan];
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionSnap = await getDoc(subscriptionRef);

    if (!subscriptionSnap.exists()) {
      throw new Error('Suscripción no encontrada');
    }

    const subscription = subscriptionSnap.data();
    const oldPlan = PLANS[subscription.plan]?.name || subscription.plan;

    await updateDoc(subscriptionRef, {
      plan: newPlan,
      monthlyPrice: planConfig.pricePerMonth,
      limits: planConfig.limits,
      updatedAt: serverTimestamp()
    });

    // Enviar notificación de cambio de plan
    await notifyPlanChanged(userId, oldPlan, planConfig.name);
  } catch (error) {
    console.error('Error al cambiar plan:', error);
    throw error;
  }
};

// Obtener todas las suscripciones (Admin)
export const getAllSubscriptions = async () => {
  try {
    const subscriptionsRef = collection(db, 'subscriptions');
    const q = query(subscriptionsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error al obtener suscripciones:', error);
    throw error;
  }
};

// Actualizar notas administrativas
export const updateNotes = async (userId, notes) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    await updateDoc(subscriptionRef, {
      notes,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error al actualizar notas:', error);
    throw error;
  }
};

// Verificar límites de uso
export const checkUsageLimits = (subscription, type) => {
  if (!subscription || !subscription.limits) return true;

  const limits = subscription.limits;
  const usage = subscription.usage || {};

  switch (type) {
    case 'invoice':
      return limits.maxInvoicesPerMonth === -1 ||
             (usage.invoicesThisMonth || 0) < limits.maxInvoicesPerMonth;
    case 'customer':
      return limits.maxCustomers === -1 ||
             (usage.totalCustomers || 0) < limits.maxCustomers;
    case 'product':
      return limits.maxProducts === -1 ||
             (usage.totalProducts || 0) < limits.maxProducts;
    case 'sunat':
      return limits.sunatIntegration === true;
    default:
      return true;
  }
};

// Actualizar contadores de uso
export const updateUsage = async (userId, type, increment = 1) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionSnap = await getDoc(subscriptionRef);

    if (!subscriptionSnap.exists()) return;

    const subscription = subscriptionSnap.data();
    const usage = subscription.usage || {};

    const updates = {
      updatedAt: serverTimestamp()
    };

    switch (type) {
      case 'invoice':
        updates['usage.invoicesThisMonth'] = (usage.invoicesThisMonth || 0) + increment;
        break;
      case 'customer':
        updates['usage.totalCustomers'] = (usage.totalCustomers || 0) + increment;
        break;
      case 'product':
        updates['usage.totalProducts'] = (usage.totalProducts || 0) + increment;
        break;
    }

    await updateDoc(subscriptionRef, updates);
  } catch (error) {
    console.error('Error al actualizar uso:', error);
    throw error;
  }
};

// Resetear contador mensual de facturas (ejecutar el 1ro de cada mes)
export const resetMonthlyUsage = async (userId) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    await updateDoc(subscriptionRef, {
      'usage.invoicesThisMonth': 0,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error al resetear uso mensual:', error);
    throw error;
  }
};
