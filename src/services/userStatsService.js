import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Obtener estadísticas completas de un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} Estadísticas del usuario
 */
export const getUserStats = async (userId) => {
  try {
    const stats = {
      invoices: {
        total: 0,
        thisMonth: 0,
        byType: {
          factura: 0,
          boleta: 0,
          nota_credito: 0,
          nota_debito: 0
        },
        bySunatStatus: {
          accepted: 0,
          rejected: 0,
          pending: 0,
          not_sent: 0
        },
        totalAmount: 0,
        totalAmountThisMonth: 0
      },
      customers: {
        total: 0
      },
      products: {
        total: 0
      },
      business: null
    };

    // Obtener información del negocio
    const businessRef = doc(db, 'businesses', userId);
    const businessSnap = await getDoc(businessRef);

    if (businessSnap.exists()) {
      stats.business = businessSnap.data();
    }

    // Obtener todas las facturas
    const invoicesRef = collection(db, 'businesses', userId, 'invoices');
    const invoicesSnap = await getDocs(invoicesRef);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    invoicesSnap.forEach((doc) => {
      const invoice = doc.data();
      stats.invoices.total++;

      // Contar por tipo
      if (invoice.documentType) {
        stats.invoices.byType[invoice.documentType] =
          (stats.invoices.byType[invoice.documentType] || 0) + 1;
      }

      // Contar por estado SUNAT
      const sunatStatus = invoice.sunatStatus || 'not_sent';
      if (sunatStatus === 'accepted') {
        stats.invoices.bySunatStatus.accepted++;
      } else if (sunatStatus === 'rejected') {
        stats.invoices.bySunatStatus.rejected++;
      } else if (sunatStatus === 'pending') {
        stats.invoices.bySunatStatus.pending++;
      } else {
        stats.invoices.bySunatStatus.not_sent++;
      }

      // Sumar montos
      if (invoice.total) {
        stats.invoices.totalAmount += invoice.total;
      }

      // Verificar si es del mes actual
      const invoiceDate = invoice.createdAt?.toDate?.() || invoice.createdAt;
      if (invoiceDate) {
        const invoiceMonth = invoiceDate.getMonth();
        const invoiceYear = invoiceDate.getFullYear();

        if (invoiceMonth === currentMonth && invoiceYear === currentYear) {
          stats.invoices.thisMonth++;
          if (invoice.total) {
            stats.invoices.totalAmountThisMonth += invoice.total;
          }
        }
      }
    });

    // Obtener clientes
    const customersRef = collection(db, 'businesses', userId, 'customers');
    const customersSnap = await getDocs(customersRef);
    stats.customers.total = customersSnap.size;

    // Obtener productos
    const productsRef = collection(db, 'businesses', userId, 'products');
    const productsSnap = await getDocs(productsRef);
    stats.products.total = productsSnap.size;

    return stats;
  } catch (error) {
    console.error('Error al obtener estadísticas del usuario:', error);
    throw error;
  }
};

/**
 * Obtener el top de usuarios por facturación
 * @param {number} limit - Cantidad de usuarios a retornar
 * @returns {Promise<Array>} Top usuarios
 */
export const getTopUsersByRevenue = async (limit = 10) => {
  try {
    // Esta función requeriría procesar todos los usuarios
    // Por ahora retornamos un array vacío
    return [];
  } catch (error) {
    console.error('Error al obtener top usuarios:', error);
    return [];
  }
};

/**
 * Calcular nueva fecha de vencimiento
 * @param {Date|Timestamp} currentEndDate - Fecha actual de vencimiento
 * @param {number} daysToAdd - Días a agregar (30 = 1 mes)
 * @returns {Date} Nueva fecha de vencimiento
 */
export const calculateNewEndDate = (currentEndDate, daysToAdd = 30) => {
  const now = new Date();
  const endDate = currentEndDate?.toDate?.() || currentEndDate;

  // Si la fecha de vencimiento ya pasó, extender desde HOY
  // Si no, extender desde la fecha de vencimiento
  const baseDate = endDate && endDate > now ? new Date(endDate) : now;

  const newDate = new Date(baseDate);
  newDate.setDate(newDate.getDate() + daysToAdd);

  return newDate;
};
