import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Navigate } from 'react-router-dom';
import {
  getAllSubscriptions,
  suspendUser,
  reactivateUser,
  registerPayment,
  changePlan,
  updateNotes,
  deleteUser,
  extendSubscription,
  PLANS
} from '@/services/subscriptionService';
import UserDetailsModal from '@/components/admin/UserDetailsModal';
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Search,
  Filter,
  Eye,
  Lock,
  Unlock,
  Edit,
  Calendar,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronRight,
  UserCircle,
  Trash2,
  CalendarPlus
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function UserManagement() {
  const { isAdmin, isLoading } = useAuth();
  const toast = useToast();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedOwners, setExpandedOwners] = useState(new Set()); // Para controlar qué owners están expandidos
  const [subUsers, setSubUsers] = useState({}); // Almacenar sub-usuarios por ownerId
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendDate, setExtendDate] = useState('');

  // Cargar sub-usuarios de un owner
  const loadSubUsers = async (ownerId) => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('ownerId', '==', ownerId));
      const querySnapshot = await getDocs(q);

      const subUsersList = [];
      querySnapshot.forEach((doc) => {
        subUsersList.push({ id: doc.id, ...doc.data() });
      });

      setSubUsers(prev => ({
        ...prev,
        [ownerId]: subUsersList
      }));
    } catch (error) {
      console.error('Error al cargar sub-usuarios:', error);
    }
  };

  // Toggle expandir/colapsar owner
  const toggleOwnerExpand = async (ownerId) => {
    const newExpanded = new Set(expandedOwners);

    if (newExpanded.has(ownerId)) {
      newExpanded.delete(ownerId);
    } else {
      newExpanded.add(ownerId);
      // Cargar sub-usuarios si aún no están cargados
      if (!subUsers[ownerId]) {
        await loadSubUsers(ownerId);
      }
    }

    setExpandedOwners(newExpanded);
  };

  // Cargar suscripciones
  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      const data = await getAllSubscriptions();
      setSubscriptions(data);
    } catch (error) {
      console.error('Error al cargar suscripciones:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadSubscriptions();
    }
  }, [isAdmin]);

  // Filtrar suscripciones
  const filteredSubscriptions = subscriptions.filter((sub) => {
    // Excluir usuarios secundarios (que tienen ownerId)
    if (sub.ownerId) {
      return false;
    }

    const matchesSearch =
      sub.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.userId?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'active' && sub.status === 'active' && !sub.accessBlocked) ||
      (filterStatus === 'suspended' && (sub.status === 'suspended' || sub.accessBlocked)) ||
      (filterStatus === 'trial' && sub.plan === 'free');

    return matchesSearch && matchesFilter;
  });

  // Estadísticas (solo usuarios principales, sin sub-usuarios)
  const primaryUsers = subscriptions.filter(s => !s.ownerId);
  const stats = {
    total: primaryUsers.length,
    active: primaryUsers.filter(s => s.status === 'active' && !s.accessBlocked).length,
    suspended: primaryUsers.filter(s => s.status === 'suspended' || s.accessBlocked).length,
    trial: primaryUsers.filter(s => s.plan === 'free').length,
  };

  // Acciones
  const handleSuspend = async (userId, reason = 'Falta de pago') => {
    if (!window.confirm('¿Estás seguro de suspender este usuario?')) return;

    try {
      setActionLoading(true);
      await suspendUser(userId, reason);
      await loadSubscriptions();
      setShowModal(false);
      toast.success('Usuario suspendido exitosamente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al suspender usuario');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async (userId, days = 30) => {
    try {
      setActionLoading(true);
      await reactivateUser(userId, days);
      await loadSubscriptions();
      setShowModal(false);
      toast.success('Usuario reactivado exitosamente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al reactivar usuario');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterPayment = async (userId, amount, method, planKey, customEndDate = null) => {
    try {
      setActionLoading(true);
      await registerPayment(userId, amount, method, planKey, customEndDate);
      await loadSubscriptions();
      setShowModal(false);
      toast.success('Pago registrado exitosamente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al registrar pago');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePlan = async (userId, newPlan) => {
    try {
      setActionLoading(true);
      await changePlan(userId, newPlan);
      await loadSubscriptions();
      setShowModal(false);
      toast.success('Plan cambiado exitosamente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cambiar plan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (user) => {
    const confirmMessage = `¿Estás seguro de ELIMINAR permanentemente al usuario "${user.businessName || user.email}"?\n\nEsta acción:\n- Eliminará la suscripción\n- Eliminará el documento de usuario\n- Eliminará todos los sub-usuarios asociados\n\n⚠️ Los datos del negocio se mantendrán por seguridad.\n\nEscribe "ELIMINAR" para confirmar:`;

    const confirmation = window.prompt(confirmMessage);

    if (confirmation !== 'ELIMINAR') {
      if (confirmation !== null) {
        toast.error('Confirmación incorrecta. El usuario NO fue eliminado.');
      }
      return;
    }

    try {
      setActionLoading(true);
      const result = await deleteUser(user.userId);
      await loadSubscriptions();
      toast.success(`Usuario eliminado. ${result.deletedSubUsers > 0 ? `También se eliminaron ${result.deletedSubUsers} sub-usuario(s).` : ''}`);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar usuario');
    } finally {
      setActionLoading(false);
    }
  };

  const openExtendModal = (user) => {
    setSelectedUser(user);
    // Pre-llenar con la fecha actual de vencimiento + 30 días
    const currentEnd = user.currentPeriodEnd?.toDate?.() || user.currentPeriodEnd || new Date();
    const newDate = new Date(currentEnd);
    newDate.setDate(newDate.getDate() + 30);
    setExtendDate(format(newDate, 'yyyy-MM-dd'));
    setShowExtendModal(true);
  };

  const handleExtendSubscription = async () => {
    if (!selectedUser || !extendDate) return;

    try {
      setActionLoading(true);
      await extendSubscription(selectedUser.userId, extendDate);
      await loadSubscriptions();
      setShowExtendModal(false);
      setSelectedUser(null);
      setExtendDate('');
      toast.success('Suscripción extendida exitosamente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al extender suscripción');
    } finally {
      setActionLoading(false);
    }
  };

  // Verificar permisos
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-gray-600">Administra suscripciones y pagos</p>
        </div>
        <button
          onClick={loadSubscriptions}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Total Usuarios</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <Users className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Activos</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Suspendidos</p>
              <p className="text-2xl font-bold text-red-600">{stats.suspended}</p>
            </div>
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">En Prueba</p>
              <p className="text-2xl font-bold text-orange-600">{stats.trial}</p>
            </div>
            <Clock className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por email, negocio o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="suspended">Suspendidos</option>
              <option value="trial">En Prueba</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No se encontraron usuarios
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha Inicio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vencimiento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubscriptions.map((sub) => {
                  // Convertir correctamente el Timestamp de Firestore para fecha de fin
                  let periodEnd = null;
                  if (sub.currentPeriodEnd) {
                    if (typeof sub.currentPeriodEnd.toDate === 'function') {
                      periodEnd = sub.currentPeriodEnd.toDate();
                    } else if (sub.currentPeriodEnd instanceof Date) {
                      periodEnd = sub.currentPeriodEnd;
                    } else if (typeof sub.currentPeriodEnd === 'object' && sub.currentPeriodEnd.seconds) {
                      periodEnd = new Date(sub.currentPeriodEnd.seconds * 1000);
                    }
                  }

                  // Convertir fecha de inicio
                  let periodStart = null;
                  if (sub.currentPeriodStart) {
                    if (typeof sub.currentPeriodStart.toDate === 'function') {
                      periodStart = sub.currentPeriodStart.toDate();
                    } else if (sub.currentPeriodStart instanceof Date) {
                      periodStart = sub.currentPeriodStart;
                    } else if (typeof sub.currentPeriodStart === 'object' && sub.currentPeriodStart.seconds) {
                      periodStart = new Date(sub.currentPeriodStart.seconds * 1000);
                    }
                  }

                  const isExpired = periodEnd && periodEnd < new Date();
                  const isBlocked = sub.accessBlocked || sub.status === 'suspended';
                  const planInfo = PLANS[sub.plan];
                  const daysElapsed = periodStart ? Math.floor((new Date() - periodStart) / (1000 * 60 * 60 * 24)) : null;

                  const ownerSubUsers = subUsers[sub.userId] || [];
                  const isExpanded = expandedOwners.has(sub.userId);

                  return (
                    <React.Fragment key={sub.id}>
                      {/* Fila principal del Business Owner */}
                      <tr className={isBlocked ? 'bg-red-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {/* Botón expandir/colapsar */}
                            <button
                              onClick={() => toggleOwnerExpand(sub.userId)}
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                              title={isExpanded ? 'Colapsar' : 'Expandir sub-usuarios'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-600" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-600" />
                              )}
                            </button>
                            <div className="flex flex-col">
                              <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                {sub.businessName || 'Sin nombre'}
                                {ownerSubUsers.length > 0 && (
                                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                                    {ownerSubUsers.length} sub-usuario{ownerSubUsers.length !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500">{sub.email}</div>
                            </div>
                          </div>
                        </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            {planInfo?.name || sub.plan}
                          </span>
                          {planInfo && (
                            <span className="text-xs text-gray-500 mt-1">
                              S/ {planInfo.pricePerMonth}/mes
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {periodStart ? (
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {format(periodStart, 'dd/MM/yyyy', { locale: es })}
                            </div>
                            <div className="text-xs text-gray-500">
                              Hace {daysElapsed} días
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">No disponible</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isBlocked ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            Suspendido
                          </span>
                        ) : isExpired ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Vencido
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {periodEnd ? (
                          <div>
                            <div className={`text-sm font-medium ${isExpired ? 'text-red-600' : 'text-gray-900'}`}>
                              {format(periodEnd, 'dd/MM/yyyy', { locale: es })}
                            </div>
                            <div className={`text-xs ${isExpired ? 'text-red-500' : 'text-gray-500'}`}>
                              {isExpired
                                ? 'Vencido hace ' + Math.abs(Math.ceil((periodEnd - new Date()) / (1000 * 60 * 60 * 24))) + ' días'
                                : 'Vence en ' + Math.ceil((periodEnd - new Date()) / (1000 * 60 * 60 * 24)) + ' días'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">No disponible</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedUser(sub);
                              setModalType('view');
                              setShowModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                            title="Ver detalles"
                          >
                            <Eye className="w-5 h-5" />
                          </button>

                          {isBlocked ? (
                            <button
                              onClick={() => handleReactivate(sub.userId)}
                              className="text-green-600 hover:text-green-900"
                              title="Reactivar"
                              disabled={actionLoading}
                            >
                              <Unlock className="w-5 h-5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSuspend(sub.userId)}
                              className="text-red-600 hover:text-red-900"
                              title="Suspender"
                              disabled={actionLoading}
                            >
                              <Lock className="w-5 h-5" />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setSelectedUser(sub);
                              setModalType('payment');
                              setShowModal(true);
                            }}
                            className="text-green-600 hover:text-green-900"
                            title="Registrar pago"
                          >
                            <DollarSign className="w-5 h-5" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedUser(sub);
                              setModalType('edit');
                              setShowModal(true);
                            }}
                            className="text-gray-600 hover:text-gray-900"
                            title="Editar"
                          >
                            <Edit className="w-5 h-5" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedUser(sub);
                              setModalType('config');
                              setShowModal(true);
                            }}
                            className="text-purple-600 hover:text-purple-900"
                            title="Configurar Emisión"
                          >
                            <Settings className="w-5 h-5" />
                          </button>

                          <button
                            onClick={() => openExtendModal(sub)}
                            className="text-orange-600 hover:text-orange-900"
                            title="Extender suscripción"
                            disabled={actionLoading}
                          >
                            <CalendarPlus className="w-5 h-5" />
                          </button>

                          <button
                            onClick={() => handleDeleteUser(sub)}
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar usuario"
                            disabled={actionLoading}
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Filas de sub-usuarios (cuando está expandido) */}
                    {isExpanded && ownerSubUsers.length > 0 && ownerSubUsers.map((subUser) => {
                      const subUserBlocked = subUser.status === 'blocked';

                      return (
                        <tr key={`sub-${subUser.id}`} className={`bg-blue-50 ${subUserBlocked ? 'opacity-60' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2 pl-8">
                              <UserCircle className="w-4 h-4 text-blue-600" />
                              <div className="flex flex-col">
                                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                  {subUser.name || 'Sin nombre'}
                                  <span className="px-2 py-0.5 text-xs bg-blue-200 text-blue-800 rounded-full">
                                    Sub-usuario
                                  </span>
                                </div>
                                <div className="text-sm text-gray-500">{subUser.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                subUser.status === 'active'
                                  ? 'bg-green-100 text-green-800'
                                  : subUser.status === 'blocked'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {subUser.status === 'active'
                                ? 'Activo'
                                : subUser.status === 'blocked'
                                ? 'Bloqueado'
                                : subUser.status || 'Desconocido'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {subUser.allowedPages && subUser.allowedPages.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {subUser.allowedPages.map((page, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded"
                                  >
                                    {page}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">Sin permisos</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            -
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            -
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            -
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setSelectedUser(subUser);
                                  setModalType('details');
                                  setShowModal(true);
                                }}
                                className="text-blue-600 hover:text-blue-900"
                                title="Ver detalles"
                              >
                                <Eye className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() =>
                                  handleToggleBlockUser(subUser.id, subUser.status === 'blocked')
                                }
                                className={
                                  subUser.status === 'blocked'
                                    ? 'text-green-600 hover:text-green-900'
                                    : 'text-red-600 hover:text-red-900'
                                }
                                title={subUser.status === 'blocked' ? 'Activar' : 'Bloquear'}
                              >
                                {subUser.status === 'blocked' ? (
                                  <CheckCircle className="w-5 h-5" />
                                ) : (
                                  <XCircle className="w-5 h-5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          type={modalType}
          onClose={() => {
            setShowModal(false);
            setSelectedUser(null);
          }}
          onRegisterPayment={handleRegisterPayment}
          onChangePlan={handleChangePlan}
          loading={actionLoading}
          toast={toast}
        />
      )}

      {/* Modal Extender Suscripción */}
      {showExtendModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Extender Suscripción</h2>
                <p className="text-sm text-gray-600">{selectedUser.businessName || selectedUser.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowExtendModal(false);
                  setSelectedUser(null);
                  setExtendDate('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Info de vencimiento actual */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">Vencimiento actual:</p>
                <p className="font-semibold text-gray-900">
                  {selectedUser.currentPeriodEnd
                    ? format(
                        selectedUser.currentPeriodEnd.toDate?.() || selectedUser.currentPeriodEnd,
                        "dd/MM/yyyy",
                        { locale: es }
                      )
                    : 'No definido'}
                </p>
              </div>

              {/* Selector de nueva fecha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nueva fecha de vencimiento
                </label>
                <input
                  type="date"
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Botones rápidos */}
              <div>
                <p className="text-sm text-gray-600 mb-2">Atajos rápidos:</p>
                <div className="flex flex-wrap gap-2">
                  {[7, 15, 30, 60, 90].map((days) => {
                    const currentEnd = selectedUser.currentPeriodEnd?.toDate?.() || selectedUser.currentPeriodEnd || new Date();
                    const baseDate = new Date(currentEnd) > new Date() ? new Date(currentEnd) : new Date();
                    const newDate = new Date(baseDate);
                    newDate.setDate(newDate.getDate() + days);

                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setExtendDate(format(newDate, 'yyyy-MM-dd'))}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                      >
                        +{days} días
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vista previa */}
              {extendDate && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700">Nueva fecha de vencimiento:</p>
                  <p className="font-bold text-green-900 text-lg">
                    {format(new Date(extendDate), "dd 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                </div>
              )}

              {/* Info */}
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <strong>Nota:</strong> Esta acción NO registra un pago. Solo extiende la fecha de vencimiento.
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowExtendModal(false);
                    setSelectedUser(null);
                    setExtendDate('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={actionLoading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExtendSubscription}
                  disabled={actionLoading || !extendDate}
                  className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <CalendarPlus className="w-4 h-4" />
                      Extender
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
