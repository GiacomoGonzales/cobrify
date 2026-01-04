import { useState, useEffect } from 'react'
import {
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Trash2,
  Loader2,
  Users,
  Shield,
  Calendar,
  Building2,
  CheckCircle,
  AlertTriangle,
  GraduationCap,
  ClipboardCheck
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { formatDate, formatCurrency } from '@/lib/utils'

// Datos de ejemplo para modo demo
const DEMO_CERTIFICATES = {
  training: [
    {
      id: 'demo-cert-1',
      type: 'training',
      certificateNumber: 'CAP-2024-001',
      customerId: 'demo-customer-1',
      customerName: 'Restaurante El Buen Sabor S.A.C.',
      customerRuc: '20123456789',
      customerAddress: 'Av. Larco 123, Miraflores, Lima',
      date: new Date(2024, 5, 15).toISOString(),
      duration: '90 minutos',
      instructor: 'Ing. Carlos Pérez',
      topics: ['Clases de fuego', 'Tipos de extintores', 'Técnicas de extinción', 'Evacuación'],
      participants: [
        { name: 'Juan García López', dni: '12345678' },
        { name: 'María Rodríguez Sánchez', dni: '87654321' },
        { name: 'Pedro Martínez Torres', dni: '45678912' }
      ],
      status: 'active',
      createdAt: new Date(2024, 5, 15).toISOString()
    }
  ],
  operability: [
    {
      id: 'demo-cert-2',
      type: 'operability',
      certificateNumber: 'OPE-2024-001',
      customerId: 'demo-customer-1',
      customerName: 'Restaurante El Buen Sabor S.A.C.',
      customerRuc: '20123456789',
      customerAddress: 'Av. Larco 123, Miraflores, Lima',
      serviceDate: new Date(2024, 5, 10).toISOString(),
      expirationDate: new Date(2025, 5, 10).toISOString(),
      technician: 'Téc. Roberto Sánchez',
      guaranteePeriod: '12 meses',
      extinguishers: [
        { type: 'PQS', capacity: '6 kg', serial: 'EXT-001', brand: 'Badger', location: 'Cocina', rechargeDate: '2024-06-10', expirationDate: '2025-06-10' },
        { type: 'CO2', capacity: '5 kg', serial: 'EXT-002', brand: 'Amerex', location: 'Oficina', rechargeDate: '2024-06-10', expirationDate: '2025-06-10' },
        { type: 'PQS', capacity: '4 kg', serial: 'EXT-003', brand: 'Badger', location: 'Almacén', rechargeDate: '2024-06-10', expirationDate: '2025-06-10' }
      ],
      status: 'active',
      createdAt: new Date(2024, 5, 10).toISOString()
    }
  ]
}

export default function Certificates() {
  const { user, isDemoMode, getBusinessId, businessSettings } = useAppContext()
  const toast = useToast()

  // Estados
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('training') // 'training' | 'operability'
  const [searchTerm, setSearchTerm] = useState('')
  const [certificates, setCertificates] = useState({ training: [], operability: [] })

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewingCertificate, setViewingCertificate] = useState(null)

  useEffect(() => {
    loadCertificates()
  }, [])

  const loadCertificates = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode) {
        setCertificates(DEMO_CERTIFICATES)
      } else {
        // TODO: Cargar certificados desde Firestore
        setCertificates({ training: [], operability: [] })
      }
    } catch (error) {
      console.error('Error loading certificates:', error)
      toast.error('Error al cargar certificados')
    } finally {
      setIsLoading(false)
    }
  }

  // Filtrar certificados por búsqueda
  const filteredCertificates = certificates[activeTab]?.filter(cert => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      cert.customerName?.toLowerCase().includes(search) ||
      cert.customerRuc?.includes(search) ||
      cert.certificateNumber?.toLowerCase().includes(search)
    )
  }) || []

  // Stats
  const stats = {
    totalTraining: certificates.training?.length || 0,
    totalOperability: certificates.operability?.length || 0,
    thisMonth: [...(certificates.training || []), ...(certificates.operability || [])].filter(c => {
      const date = new Date(c.createdAt)
      const now = new Date()
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    }).length
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-500">Cargando certificados...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Certificados</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona certificados de capacitación y operatividad de extintores
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Certificado
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <GraduationCap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalTraining}</p>
                <p className="text-sm text-gray-500">Capacitaciones</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <ClipboardCheck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalOperability}</p>
                <p className="text-sm text-gray-500">Operatividad</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.thisMonth}</p>
                <p className="text-sm text-gray-500">Este mes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('training')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'training'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <GraduationCap className="w-4 h-4 inline mr-2" />
          Capacitación
        </button>
        <button
          onClick={() => setActiveTab('operability')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'operability'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardCheck className="w-4 h-4 inline mr-2" />
          Operatividad
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, RUC o N° certificado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Lista de Certificados */}
      <Card>
        <CardContent className="p-0">
          {filteredCertificates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay certificados de {activeTab === 'training' ? 'capacitación' : 'operatividad'}
              </h3>
              <p className="text-gray-500 mb-4">
                Crea tu primer certificado para comenzar
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Certificado
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredCertificates.map((cert) => (
                <div
                  key={cert.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`p-2 rounded-lg ${
                        activeTab === 'training' ? 'bg-blue-100' : 'bg-green-100'
                      }`}>
                        {activeTab === 'training' ? (
                          <GraduationCap className={`w-5 h-5 ${
                            activeTab === 'training' ? 'text-blue-600' : 'text-green-600'
                          }`} />
                        ) : (
                          <ClipboardCheck className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">
                            {cert.certificateNumber}
                          </span>
                          <Badge variant={cert.status === 'active' ? 'success' : 'secondary'}>
                            {cert.status === 'active' ? 'Vigente' : 'Vencido'}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-900 font-medium truncate">
                          {cert.customerName}
                        </p>
                        <p className="text-sm text-gray-500">
                          RUC: {cert.customerRuc}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {activeTab === 'training' ? (
                            <>Fecha: {formatDate(new Date(cert.date))} | {cert.participants?.length || 0} participantes</>
                          ) : (
                            <>Servicio: {formatDate(new Date(cert.serviceDate))} | Vence: {formatDate(new Date(cert.expirationDate))}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingCertificate(cert)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toast.info('Función de descarga próximamente')}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Crear Certificado */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Nuevo Certificado"
        size="lg"
      >
        <div className="space-y-6">
          <p className="text-gray-600">
            Selecciona el tipo de certificado que deseas crear:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Certificado de Capacitación */}
            <button
              onClick={() => {
                setShowCreateModal(false)
                toast.info('Formulario de Capacitación próximamente')
              }}
              className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                <GraduationCap className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Certificado de Capacitación</h3>
              <p className="text-sm text-gray-500">
                Para personas que completaron entrenamiento en uso y manejo de extintores
              </p>
              <ul className="mt-3 text-xs text-gray-400 space-y-1">
                <li>• Lista de participantes</li>
                <li>• Temas cubiertos</li>
                <li>• Instructor y fecha</li>
              </ul>
            </button>

            {/* Certificado de Operatividad */}
            <button
              onClick={() => {
                setShowCreateModal(false)
                toast.info('Formulario de Operatividad próximamente')
              }}
              className="p-6 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left group"
            >
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                <ClipboardCheck className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Certificado de Operatividad</h3>
              <p className="text-sm text-gray-500">
                Para extintores que fueron recargados o recibieron mantenimiento
              </p>
              <ul className="mt-3 text-xs text-gray-400 space-y-1">
                <li>• Lista de extintores</li>
                <li>• Fechas de servicio</li>
                <li>• Garantía y técnico</li>
              </ul>
            </button>
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Ver Certificado */}
      <Modal
        isOpen={!!viewingCertificate}
        onClose={() => setViewingCertificate(null)}
        title={`Certificado ${viewingCertificate?.certificateNumber || ''}`}
        size="lg"
      >
        {viewingCertificate && (
          <div className="space-y-6">
            {/* Info del Cliente */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <Building2 className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-900">Datos del Cliente</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Empresa:</span>
                  <p className="font-medium">{viewingCertificate.customerName}</p>
                </div>
                <div>
                  <span className="text-gray-500">RUC:</span>
                  <p className="font-medium">{viewingCertificate.customerRuc}</p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-gray-500">Dirección:</span>
                  <p className="font-medium">{viewingCertificate.customerAddress}</p>
                </div>
              </div>
            </div>

            {/* Contenido específico según tipo */}
            {viewingCertificate.type === 'training' ? (
              <>
                {/* Info de Capacitación */}
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <GraduationCap className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-gray-900">Datos de la Capacitación</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Fecha:</span>
                      <p className="font-medium">{formatDate(new Date(viewingCertificate.date))}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Duración:</span>
                      <p className="font-medium">{viewingCertificate.duration}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Instructor:</span>
                      <p className="font-medium">{viewingCertificate.instructor}</p>
                    </div>
                  </div>
                </div>

                {/* Temas */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Temas Cubiertos</h4>
                  <div className="flex flex-wrap gap-2">
                    {viewingCertificate.topics?.map((topic, idx) => (
                      <Badge key={idx} variant="secondary">{topic}</Badge>
                    ))}
                  </div>
                </div>

                {/* Participantes */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">
                    Participantes ({viewingCertificate.participants?.length || 0})
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Nombre</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">DNI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {viewingCertificate.participants?.map((p, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2">{p.name}</td>
                            <td className="px-4 py-2">{p.dni}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Info de Operatividad */}
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <ClipboardCheck className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-gray-900">Datos del Servicio</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Fecha de Servicio:</span>
                      <p className="font-medium">{formatDate(new Date(viewingCertificate.serviceDate))}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Fecha de Vencimiento:</span>
                      <p className="font-medium">{formatDate(new Date(viewingCertificate.expirationDate))}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Técnico:</span>
                      <p className="font-medium">{viewingCertificate.technician}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Garantía:</span>
                      <p className="font-medium">{viewingCertificate.guaranteePeriod}</p>
                    </div>
                  </div>
                </div>

                {/* Extintores */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">
                    Extintores Servidos ({viewingCertificate.extinguishers?.length || 0})
                  </h4>
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Tipo</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Capacidad</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Serie</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Marca</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Ubicación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {viewingCertificate.extinguishers?.map((ext, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-medium">{ext.type}</td>
                            <td className="px-3 py-2">{ext.capacity}</td>
                            <td className="px-3 py-2">{ext.serial}</td>
                            <td className="px-3 py-2">{ext.brand}</td>
                            <td className="px-3 py-2">{ext.location}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setViewingCertificate(null)}>
                Cerrar
              </Button>
              <Button onClick={() => toast.info('Descarga de PDF próximamente')}>
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
