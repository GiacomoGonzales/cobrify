import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
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
      maxBranches: 1, // 1 sucursal en prueba
      sunatIntegration: false, // Bloqueado en prueba
      multiUser: false
    }
  },

  // ============================================
  // PLAN SIN CONEXIÓN (Sin QPSE ni SUNAT)
  // ============================================
  offline_1_month: {
    name: "Plan Sin Conexión - 1 Mes",
    category: "offline",
    months: 1,
    pricePerMonth: 14.90,
    totalPrice: 14.90,
    emissionMethod: "offline", // Sin conexión a SUNAT
    limits: {
      maxInvoicesPerMonth: -1, // Ilimitado (no reporta a SUNAT)
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 1,
      sunatIntegration: false, // Sin integración SUNAT
      multiUser: true
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
      maxBranches: 1, // 1 sucursal incluida, admin puede aumentar
      sunatIntegration: true,
      multiUser: true // Todos los planes son multiusuario
    }
  },
  qpse_1_month_2_branches: {
    name: "Plan QPse - 1 Mes (2 Sucursales)",
    category: "qpse",
    months: 1,
    pricePerMonth: 39.80,
    totalPrice: 39.80,
    emissionMethod: "qpse",
    limits: {
      maxInvoicesPerMonth: 500,
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 2, // 2 sucursales incluidas
      sunatIntegration: true,
      multiUser: true
    }
  },
  qpse_1_month_3_branches: {
    name: "Plan QPse - 1 Mes (3 Sucursales)",
    category: "qpse",
    months: 1,
    pricePerMonth: 29.90,
    totalPrice: 29.90,
    emissionMethod: "qpse",
    limits: {
      maxInvoicesPerMonth: 500,
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 3, // 3 sucursales incluidas
      sunatIntegration: true,
      multiUser: true
    }
  },
  qpse_1_month_1000: {
    name: "Plan QPse 1000 - 1 Mes",
    category: "qpse",
    months: 1,
    pricePerMonth: 29.90,
    totalPrice: 29.90,
    emissionMethod: "qpse",
    limits: {
      maxInvoicesPerMonth: 1000, // 1000 comprobantes/mes
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
    }
  },

  // ============================================
  // ADD-ONS (Paquetes adicionales)
  // ============================================
  addon_500_comprobantes: {
    name: "+500 Comprobantes",
    category: "addon",
    months: 0, // No extiende tiempo
    pricePerMonth: 10.00,
    totalPrice: 10.00,
    emissionMethod: "qpse",
    isAddon: true, // Flag para identificar que es un add-on
    addonType: "invoices",
    addonAmount: 500, // Cantidad de comprobantes a agregar
    limits: null // No modifica límites del plan base
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
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
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
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
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
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
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
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
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
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
    },
    badge: "Ahorra S/89"
  },

  // ============================================
  // PLANES NUEVOS 2024 (Precios actualizados)
  // ============================================
  qpse_1_month_2024: {
    name: "Plan QPse - 1 Mes",
    category: "qpse",
    months: 1,
    pricePerMonth: 29.90,
    totalPrice: 29.90,
    emissionMethod: "qpse",
    limits: {
      maxInvoicesPerMonth: 500,
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
    }
  },
  qpse_6_months_2024: {
    name: "Plan QPse - 6 Meses",
    category: "qpse",
    months: 6,
    pricePerMonth: 24.98, // 149.90 / 6
    totalPrice: 149.90,
    emissionMethod: "qpse",
    limits: {
      maxInvoicesPerMonth: 500,
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
    },
    badge: "Ahorra S/29.50"
  },
  qpse_12_months_2024: {
    name: "Plan QPse - 12 Meses",
    category: "qpse",
    months: 12,
    pricePerMonth: 16.66, // 199.90 / 12
    totalPrice: 199.90,
    emissionMethod: "qpse",
    limits: {
      maxInvoicesPerMonth: 500,
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
    },
    badge: "Ahorra S/158.90"
  },
  sunat_direct_1_month_2024: {
    name: "Plan SUNAT Directo - 1 Mes",
    category: "sunat_direct",
    months: 1,
    pricePerMonth: 29.90,
    totalPrice: 29.90,
    emissionMethod: "sunat_direct",
    limits: {
      maxInvoicesPerMonth: -1,
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
    }
  },
  sunat_direct_6_months_2024: {
    name: "Plan SUNAT Directo - 6 Meses",
    category: "sunat_direct",
    months: 6,
    pricePerMonth: 24.98, // 149.90 / 6
    totalPrice: 149.90,
    emissionMethod: "sunat_direct",
    limits: {
      maxInvoicesPerMonth: -1,
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
    },
    badge: "Ahorra S/29.50"
  },
  sunat_direct_12_months_2024: {
    name: "Plan SUNAT Directo - 12 Meses",
    category: "sunat_direct",
    months: 12,
    pricePerMonth: 16.66, // 199.90 / 12
    totalPrice: 199.90,
    emissionMethod: "sunat_direct",
    limits: {
      maxInvoicesPerMonth: -1,
      maxCustomers: -1,
      maxProducts: -1,
      maxBranches: 1,
      sunatIntegration: true,
      multiUser: true
    },
    badge: "Ahorra S/158.90"
  },

  // Plan Enterprise (para casos especiales/admin - TODO ILIMITADO, SIN VENCIMIENTO)
  enterprise: {
    name: "Plan Enterprise",
    category: "enterprise",
    months: 999, // No vence prácticamente
    pricePerMonth: 0,
    totalPrice: 0,
    emissionMethod: "any", // Puede usar cualquier método
    neverExpires: true, // Flag especial para Enterprise
    limits: {
      maxInvoicesPerMonth: -1, // Ilimitado
      maxCustomers: -1, // Ilimitado
      maxProducts: -1, // Ilimitado
      maxBranches: -1, // Ilimitado
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
      // Features especiales habilitadas por admin (productImages, etc.)
      features: {
        productImages: false
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
// Retorna: true (acceso normal), false (sin acceso), o 'grace' (período de gracia de 24h)
export const hasActiveAccess = (subscription) => {
  if (!subscription) return false;

  // Verificar que no esté bloqueado
  if (subscription.accessBlocked === true) return false;

  // Verificar que el estado sea activo
  if (subscription.status !== 'active') return false;

  // Verificar que no haya expirado el período
  const now = new Date();
  const periodEnd = subscription.currentPeriodEnd?.toDate?.() || subscription.currentPeriodEnd;

  if (periodEnd && periodEnd < now) {
    // Cuentas de reseller: sin período de gracia, suspensión inmediata
    if (subscription.resellerId) {
      return false;
    }

    // Verificar período de gracia (24 horas después del vencimiento)
    const gracePeriodMs = 24 * 60 * 60 * 1000; // 24 horas
    const timeSinceExpiry = now.getTime() - new Date(periodEnd).getTime();

    if (timeSinceExpiry < gracePeriodMs) {
      return 'grace'; // Dentro del período de gracia
    }

    return false; // Período de gracia expirado
  }

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
export const registerPayment = async (userId, amount, method = 'Transferencia', selectedPlan = 'plan_3_months', customEndDate = null) => {
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

    // Verificar si es un add-on (paquete adicional)
    if (planConfig?.isAddon) {
      // Para add-ons: solo registrar pago y aumentar límite de comprobantes
      const paymentRecord = {
        date: Timestamp.fromDate(now),
        amount,
        method,
        plan: selectedPlan,
        planName: planConfig.name,
        months: 0,
        addonType: planConfig.addonType,
        addonAmount: planConfig.addonAmount,
        status: 'completed',
        registeredBy: 'admin'
      };

      const updatedHistory = [...(subscription.paymentHistory || []), paymentRecord];

      // Calcular nuevo límite de comprobantes
      const currentLimit = subscription.limits?.maxInvoicesPerMonth || 500;
      const newLimit = currentLimit + (planConfig.addonAmount || 0);

      await updateDoc(subscriptionRef, {
        'limits.maxInvoicesPerMonth': newLimit,
        lastPaymentDate: Timestamp.fromDate(now),
        paymentHistory: updatedHistory,
        updatedAt: serverTimestamp()
      });

      // Enviar notificación
      await notifyPaymentReceived(userId, amount, planConfig.name, null);
      return;
    }

    // Para planes normales: extender suscripción
    const monthsToAdd = planConfig?.months || 3;

    let newPeriodEnd;

    // Si se proporciona una fecha personalizada, usarla
    if (customEndDate) {
      newPeriodEnd = new Date(customEndDate);
    } else {
      // Calcular automáticamente sumando meses
      // Si la fecha de vencimiento ya pasó, extender desde HOY
      // Si no, extender desde la fecha de vencimiento actual
      const baseDate = currentPeriodEnd && new Date(currentPeriodEnd) > now
        ? new Date(currentPeriodEnd)
        : now;

      newPeriodEnd = new Date(baseDate);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + monthsToAdd);
    }

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
// NOTA: Esta función solo cambia el tipo de plan y sus límites, NO modifica las fechas de suscripción.
// Para registrar un pago y extender la suscripción, usar registerPayment()
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

    // Solo actualizar el plan y sus límites, SIN tocar las fechas
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

    // Obtener información adicional del usuario (para saber si es sub-usuario)
    const subscriptionsWithUserInfo = await Promise.all(
      querySnapshot.docs.map(async (docSnapshot) => {
        const subscriptionData = {
          id: docSnapshot.id,
          ...docSnapshot.data()
        };

        // Consultar el documento del usuario para obtener ownerId si existe
        try {
          const userRef = doc(db, 'users', docSnapshot.id);
          const userDoc = await getDoc(userRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            // Agregar ownerId si el usuario es secundario
            if (userData.ownerId) {
              subscriptionData.ownerId = userData.ownerId;
            }
          }
        } catch (userError) {
          console.error(`Error al obtener info de usuario ${docSnapshot.id}:`, userError);
          // Continuar sin el ownerId si hay error
        }

        return subscriptionData;
      })
    );

    return subscriptionsWithUserInfo;
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

// Actualizar features de un usuario (Admin)
export const updateUserFeatures = async (userId, features) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    await updateDoc(subscriptionRef, {
      features,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error al actualizar features:', error);
    throw error;
  }
};

// Actualizar límite de sucursales de un usuario (Admin)
// Permite al admin aumentar o disminuir el límite de sucursales individualmente
export const updateMaxBranches = async (userId, maxBranches) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    await updateDoc(subscriptionRef, {
      'limits.maxBranches': maxBranches,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error al actualizar límite de sucursales:', error);
    throw error;
  }
};

// Verificar límites de uso
// IMPORTANTE: Para facturas, el límite depende del método de emisión configurado:
// - QPse: 500 comprobantes/mes (limitado por el plan)
// - SUNAT Directo: Ilimitado (sin importar el plan, porque usan su CDT)
export const checkUsageLimits = (subscription, type, emissionMethod = null, currentCount = 0) => {
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
    case 'branch':
      // Verificar límite de sucursales (currentCount es el número actual de sucursales)
      return limits.maxBranches === -1 || currentCount < limits.maxBranches;
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

// Extender suscripción sin registrar pago (Admin)
// Útil para regalar días, ajustes manuales, cortesías, etc.
export const extendSubscription = async (userId, newEndDate) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionSnap = await getDoc(subscriptionRef);

    if (!subscriptionSnap.exists()) {
      throw new Error('Suscripción no encontrada');
    }

    await updateDoc(subscriptionRef, {
      currentPeriodEnd: Timestamp.fromDate(new Date(newEndDate)),
      nextPaymentDate: Timestamp.fromDate(new Date(newEndDate)),
      status: 'active',
      accessBlocked: false,
      blockReason: null,
      blockedAt: null,
      updatedAt: serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('Error al extender suscripción:', error);
    throw error;
  }
};

// Eliminar usuario completamente (Admin)
// ADVERTENCIA: Esta acción elimina la suscripción y el documento de usuario
// Los datos del negocio (businesses/{userId}) se mantienen por seguridad
export const deleteUser = async (userId) => {
  try {
    // 1. Eliminar suscripción
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionSnap = await getDoc(subscriptionRef);

    if (subscriptionSnap.exists()) {
      await deleteDoc(subscriptionRef);
    }

    // 2. Eliminar documento de usuario
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      await deleteDoc(userRef);
    }

    // 3. Eliminar sub-usuarios asociados
    const usersRef = collection(db, 'users');
    const subUsersQuery = query(usersRef, where('ownerId', '==', userId));
    const subUsersSnap = await getDocs(subUsersQuery);

    const deletePromises = subUsersSnap.docs.map(subUserDoc =>
      deleteDoc(doc(db, 'users', subUserDoc.id))
    );
    await Promise.all(deletePromises);

    return {
      success: true,
      deletedSubUsers: subUsersSnap.size
    };
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    throw error;
  }
};
