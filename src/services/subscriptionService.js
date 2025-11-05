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

// Planes disponibles - Nuevos precios 2025
export const PLANS = {
  trial: {
    name: "Prueba Gratuita",
    months: 0,
    pricePerMonth: 0,
    totalPrice: 0,
    duration: 1, // días
    limits: {
      maxInvoicesPerMonth: -1, // ilimitado durante prueba
      maxCustomers: -1, // ilimitado
      maxProducts: -1, // ilimitado
      sunatIntegration: false, // Bloqueado en prueba
      multiUser: false
    }
  },

  // ============================================
  // PLANES CON QPSE (500 comprobantes/mes)
  // ============================================
  qpse_1_month: {
    name: "Plan QPse - 1 Mes",
    category: "qpse",
    months: 1,
    pricePerMonth: 19.90,
    totalPrice: 19.90,
    emissionMethod: "qpse", // Identifica que usa QPse
    limits: {
      maxInvoicesPerMonth: 500, // Límite por QPse
      maxCustomers: -1, // ilimitado
      maxProducts: -1, // ilimitado
      sunatIntegration: true,
      multiUser: false
    }
  },
  qpse_6_months: {
    name: "Plan QPse - 6 Meses",
    category: "qpse",
    months: 6,
    pricePerMonth: 16.65, // 99.90 / 6
    totalPrice: 99.90,
    emissionMethod: "qpse",
    limits: {
      maxInvoicesPerMonth: 500, // 500 comprobantes/mes renovables
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: false
    },
    badge: "Ahorra S/20"
  },
  qpse_12_months: {
    name: "Plan QPse - 12 Meses",
    category: "qpse",
    months: 12,
    pricePerMonth: 12.49, // 149.90 / 12
    totalPrice: 149.90,
    emissionMethod: "qpse",
    limits: {
      maxInvoicesPerMonth: 500, // 500 comprobantes/mes renovables
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: false
    },
    badge: "Ahorra S/89"
  },

  // ============================================
  // PLANES CON CDT PROPIO (ILIMITADOS)
  // ============================================
  sunat_direct_1_month: {
    name: "Plan SUNAT Directo - 1 Mes",
    category: "sunat_direct",
    months: 1,
    pricePerMonth: 19.90,
    totalPrice: 19.90,
    emissionMethod: "sunat_direct", // Identifica que usa CDT propio
    limits: {
      maxInvoicesPerMonth: -1, // ILIMITADO con CDT propio
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: false
    }
  },
  sunat_direct_6_months: {
    name: "Plan SUNAT Directo - 6 Meses",
    category: "sunat_direct",
    months: 6,
    pricePerMonth: 16.65, // 99.90 / 6
    totalPrice: 99.90,
    emissionMethod: "sunat_direct",
    limits: {
      maxInvoicesPerMonth: -1, // ILIMITADO con CDT propio
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: false
    },
    badge: "Ahorra S/20"
  },
  sunat_direct_12_months: {
    name: "Plan SUNAT Directo - 12 Meses",
    category: "sunat_direct",
    months: 12,
    pricePerMonth: 12.49, // 149.90 / 12
    totalPrice: 149.90,
    emissionMethod: "sunat_direct",
    limits: {
      maxInvoicesPerMonth: -1, // ILIMITADO con CDT propio
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: false
    },
    badge: "Ahorra S/89"
  },

  // Plan Enterprise (para casos especiales/admin)
  enterprise: {
    name: "Plan Enterprise",
    category: "enterprise",
    months: 12,
    pricePerMonth: 0,
    totalPrice: 0,
    emissionMethod: "any", // Puede usar cualquier método
    limits: {
      maxInvoicesPerMonth: -1,
      maxCustomers: -1,
      maxProducts: -1,
      sunatIntegration: true,
      multiUser: true
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
// IMPORTANTE: Para facturas, el límite depende del método de emisión configurado:
// - QPse: 500 comprobantes/mes (limitado por el plan)
// - SUNAT Directo: Ilimitado (sin importar el plan, porque usan su CDT)
export const checkUsageLimits = (subscription, type, emissionMethod = null) => {
  if (!subscription || !subscription.limits) return true;

  const limits = subscription.limits;
  const usage = subscription.usage || {};

  switch (type) {
    case 'invoice':
      // Si usa SUNAT Directo (CDT propio), siempre es ilimitado
      if (emissionMethod === 'sunat_direct') {
        return true;
      }
      // Si usa QPse, aplicar el límite del plan
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
