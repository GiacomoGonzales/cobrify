import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function UserManagement() {
  const { isAdmin, isLoading } = useAuth();
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

  // Filtrar suscripciones
  const filteredSubscriptions = subscriptions.filter((sub) => {
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

  // Estadísticas
  const stats = {
    total: subscriptions.length,
    active: subscriptions.filter(s => s.status === 'active' && !s.accessBlocked).length,
    suspended: subscriptions.filter(s => s.status === 'suspended' || s.accessBlocked).length,
    trial: subscriptions.filter(s => s.plan === 'free').length,
  };

  // Acciones
  const handleSuspend = async (userId, reason = 'Falta de pago') => {
    if (!confirm('¿Estás seguro de suspender este usuario?')) return;

    try {
      setActionLoading(true);
      await suspendUser(userId, reason);
      await loadSubscriptions();
      setShowModal(false);
      alert('Usuario suspendido exitosamente');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al suspender usuario');
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
      alert('Usuario reactivado exitosamente');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al reactivar usuario');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterPayment = async (userId, amount, method, days = 30) => {
    try {
      setActionLoading(true);
      await registerPayment(userId, amount, method, days);
      await loadSubscriptions();
      setShowModal(false);
      alert('Pago registrado exitosamente');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al registrar pago');
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
      alert('Plan cambiado exitosamente');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al cambiar plan');
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
                  const periodEnd = sub.currentPeriodEnd?.toDate?.() || sub.currentPeriodEnd;
                  const isExpired = periodEnd && new Date(periodEnd) < new Date();
                  const isBlocked = sub.accessBlocked || sub.status === 'suspended';

                  return (
                    <tr key={sub.id} className={isBlocked ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="text-sm font-medium text-gray-900">
                            {sub.businessName || 'Sin nombre'}
                          </div>
                          <div className="text-sm text-gray-500">{sub.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 capitalize">
                          {sub.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isBlocked ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            Suspendido
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {periodEnd ? format(new Date(periodEnd), 'dd/MM/yyyy', { locale: es }) : 'N/A'}
                        </div>
                        {isExpired && !isBlocked && (
                          <div className="text-xs text-red-600">Vencido</div>
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
                        </div>
                      </td>
                    </tr>
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
        />
      )}
    </div>
  );
}
