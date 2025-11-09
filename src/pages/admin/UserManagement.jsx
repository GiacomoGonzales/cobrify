import { useState, useEffect } from 'react';
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
  Settings
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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

  // Agrupar usuarios por jerarquía: Business Owners y sus usuarios secundarios
  const groupUsersByHierarchy = () => {
    const businessOwners = subscriptions.filter(sub => sub.isBusinessOwner || sub.businessId === sub.userId);
    const secondaryUsers = subscriptions.filter(sub => !sub.isBusinessOwner && sub.businessId !== sub.userId);

    // Crear un mapa de Business Owners con sus usuarios secundarios
    const hierarchy = businessOwners.map(owner => ({
      ...owner,
      secondaryUsers: secondaryUsers.filter(user => user.businessId === owner.userId)
    }));

    return hierarchy;
  };

  // Filtrar suscripciones (ahora con jerarquía)
  const filteredSubscriptions = groupUsersByHierarchy().filter((sub) => {
    const matchesSearch =
      sub.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.userId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.secondaryUsers?.some(user =>
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.businessName?.toLowerCase().includes(searchTerm.toLowerCase())
      );

    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'active' && sub.status === 'active' && !sub.accessBlocked) ||
      (filterStatus === 'suspended' && (sub.status === 'suspended' || sub.accessBlocked)) ||
      (filterStatus === 'trial' && sub.plan === 'free');

    return matchesSearch && matchesFilter;
  });

  // Estadísticas
  const stats = {
    total: subscriptions.length,
    active: subscriptions.filter(s => s.status === 'active' && !s.accessBlocked).length,
    suspended: subscriptions.filter(s => s.status === 'suspended' || s.accessBlocked).length,
    trial: subscriptions.filter(s => s.plan === 'free').length,
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

  const handleRegisterPayment = async (userId, amount, method, planKey) => {
    try {
      setActionLoading(true);
      await registerPayment(userId, amount, method, planKey);
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
                  const hasSecondaryUsers = sub.secondaryUsers && sub.secondaryUsers.length > 0;
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

                  return (
                    <>
                      {/* Fila del Business Owner */}
                      <tr key={sub.id} className={isBlocked ? 'bg-red-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {hasSecondaryUsers && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-semibold">
                                Principal
                              </span>
                            )}
                            <div className="flex flex-col">
                              <div className="text-sm font-medium text-gray-900">
                                {sub.businessName || 'Sin nombre'}
                              </div>
                              <div className="text-sm text-gray-500">{sub.email}</div>
                              {hasSecondaryUsers && (
                                <div className="text-xs text-blue-600 mt-1">
                                  {sub.secondaryUsers.length} usuario(s) secundario(s)
                                </div>
                              )}
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
                        </div>
                      </td>
                    </tr>

                    {/* Filas de usuarios secundarios */}
                    {hasSecondaryUsers && sub.secondaryUsers.map((secondaryUser) => {
                      // Calcular datos para usuario secundario
                      let secPeriodEnd = null;
                      if (secondaryUser.currentPeriodEnd) {
                        if (typeof secondaryUser.currentPeriodEnd.toDate === 'function') {
                          secPeriodEnd = secondaryUser.currentPeriodEnd.toDate();
                        } else if (secondaryUser.currentPeriodEnd instanceof Date) {
                          secPeriodEnd = secondaryUser.currentPeriodEnd;
                        } else if (typeof secondaryUser.currentPeriodEnd === 'object' && secondaryUser.currentPeriodEnd.seconds) {
                          secPeriodEnd = new Date(secondaryUser.currentPeriodEnd.seconds * 1000);
                        }
                      }

                      let secPeriodStart = null;
                      if (secondaryUser.currentPeriodStart) {
                        if (typeof secondaryUser.currentPeriodStart.toDate === 'function') {
                          secPeriodStart = secondaryUser.currentPeriodStart.toDate();
                        } else if (secondaryUser.currentPeriodStart instanceof Date) {
                          secPeriodStart = secondaryUser.currentPeriodStart;
                        } else if (typeof secondaryUser.currentPeriodStart === 'object' && secondaryUser.currentPeriodStart.seconds) {
                          secPeriodStart = new Date(secondaryUser.currentPeriodStart.seconds * 1000);
                        }
                      }

                      const secIsExpired = secPeriodEnd && secPeriodEnd < new Date();
                      const secIsBlocked = secondaryUser.accessBlocked || secondaryUser.status === 'suspended';
                      const secPlanInfo = PLANS[secondaryUser.plan];
                      const secDaysElapsed = secPeriodStart ? Math.floor((new Date() - secPeriodStart) / (1000 * 60 * 60 * 24)) : null;

                      return (
                        <tr key={secondaryUser.id} className={`${secIsBlocked ? 'bg-red-50/50' : 'bg-gray-50/50'} border-l-4 border-l-blue-300`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2 pl-8">
                              <span className="text-gray-400">└─</span>
                              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-semibold">
                                Secundario
                              </span>
                              <div className="flex flex-col">
                                <div className="text-sm font-medium text-gray-700">
                                  {secondaryUser.businessName || 'Sin nombre'}
                                </div>
                                <div className="text-sm text-gray-500">{secondaryUser.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                                {secPlanInfo?.name || secondaryUser.plan}
                              </span>
                              {secPlanInfo && (
                                <span className="text-xs text-gray-500 mt-1">
                                  S/ {secPlanInfo.pricePerMonth}/mes
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {secPeriodStart ? (
                              <div>
                                <div className="text-sm font-medium text-gray-700">
                                  {format(secPeriodStart, 'dd/MM/yyyy', { locale: es })}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Hace {secDaysElapsed} días
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">No disponible</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {secIsBlocked ? (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                Suspendido
                              </span>
                            ) : secIsExpired ? (
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
                            {secPeriodEnd ? (
                              <div>
                                <div className={`text-sm font-medium ${secIsExpired ? 'text-red-600' : 'text-gray-700'}`}>
                                  {format(secPeriodEnd, 'dd/MM/yyyy', { locale: es })}
                                </div>
                                <div className={`text-xs ${secIsExpired ? 'text-red-500' : 'text-gray-500'}`}>
                                  {secIsExpired
                                    ? 'Vencido hace ' + Math.abs(Math.ceil((secPeriodEnd - new Date()) / (1000 * 60 * 60 * 24))) + ' días'
                                    : 'Vence en ' + Math.ceil((secPeriodEnd - new Date()) / (1000 * 60 * 60 * 24)) + ' días'}
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
                                  setSelectedUser(secondaryUser);
                                  setModalType('view');
                                  setShowModal(true);
                                }}
                                className="text-blue-600 hover:text-blue-900"
                                title="Ver detalles"
                              >
                                <Eye className="w-5 h-5" />
                              </button>

                              {secIsBlocked ? (
                                <button
                                  onClick={() => handleReactivate(secondaryUser.userId)}
                                  className="text-green-600 hover:text-green-900"
                                  title="Reactivar"
                                  disabled={actionLoading}
                                >
                                  <Unlock className="w-5 h-5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSuspend(secondaryUser.userId)}
                                  className="text-red-600 hover:text-red-900"
                                  title="Suspender"
                                  disabled={actionLoading}
                                >
                                  <Lock className="w-5 h-5" />
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setSelectedUser(secondaryUser);
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
                                  setSelectedUser(secondaryUser);
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
                                  setSelectedUser(secondaryUser);
                                  setModalType('config');
                                  setShowModal(true);
                                }}
                                className="text-purple-600 hover:text-purple-900"
                                title="Configurar Emisión"
                              >
                                <Settings className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    </>
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
    </div>
  );
}
