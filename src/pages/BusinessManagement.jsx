import { useState, useEffect } from 'react'
import { Building2, Settings as SettingsIcon, Shield, Loader2, Eye, EyeOff, Save } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/contexts/ToastContext'
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const SUPER_ADMIN_EMAIL = 'giiacomo@gmail.com'

export default function BusinessManagement() {
  const { user, isAdmin } = useAuth()
  const toast = useToast()
  const [businesses, setBusinesses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const [emissionConfig, setEmissionConfig] = useState({
    method: 'qpse',
    qpse: {
      usuario: '',
      password: '',
      environment: 'demo'
    },
    sunat: {
      usuario: '',
      password: '',
      ruc: ''
    }
  })
  const [isSaving, setIsSaving] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)

  // Solo super admin puede acceder
  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL

  useEffect(() => {
    if (isSuperAdmin) {
      loadBusinesses()
    }
  }, [isSuperAdmin])

  const loadBusinesses = async () => {
    setIsLoading(true)
    try {
      const businessesRef = collection(db, 'businesses')
      const snapshot = await getDocs(businessesRef)

      const businessList = []
      snapshot.forEach((doc) => {
        businessList.push({
          id: doc.id,
          ...doc.data()
        })
      })

      setBusinesses(businessList)
    } catch (error) {
      console.error('Error al cargar negocios:', error)
      toast.error('Error al cargar negocios')
    } finally {
      setIsLoading(false)
    }
  }

  const openConfigModal = async (business) => {
    setSelectedBusiness(business)

    // Cargar configuración existente si existe
    try {
      const businessDoc = await getDoc(doc(db, 'businesses', business.id))
      const data = businessDoc.data()

      if (data?.emissionConfig) {
        setEmissionConfig(data.emissionConfig)
      } else {
        // Valores por defecto
        setEmissionConfig({
          method: 'qpse',
          qpse: {
            usuario: '',
            password: '',
            environment: 'demo'
          },
          sunat: {
            usuario: '',
            password: '',
            ruc: business.ruc || ''
          }
        })
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error)
    }

    setIsModalOpen(true)
  }

  const handleSaveConfig = async () => {
    if (!selectedBusiness) return

    setIsSaving(true)
    try {
      const businessRef = doc(db, 'businesses', selectedBusiness.id)

      await updateDoc(businessRef, {
        emissionConfig: emissionConfig,
        updatedAt: new Date()
      })

      toast.success('Configuración guardada exitosamente')
      setIsModalOpen(false)
      loadBusinesses()
    } catch (error) {
      console.error('Error al guardar configuración:', error)
      toast.error('Error al guardar configuración')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleBusinessStatus = async (businessId, currentStatus) => {
    try {
      const businessRef = doc(db, 'businesses', businessId)
      await updateDoc(businessRef, {
        isActive: !currentStatus,
        updatedAt: new Date()
      })

      toast.success(`Negocio ${!currentStatus ? 'activado' : 'desactivado'}`)
      loadBusinesses()
    } catch (error) {
      console.error('Error al cambiar estado:', error)
      toast.error('Error al cambiar estado del negocio')
    }
  }

  // Control de acceso
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">
            Solo el Super Admin puede acceder a esta página
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando negocios...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestión de Negocios</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Administra la configuración de emisión de comprobantes por negocio
          </p>
        </div>
      </div>

      {/* Tabla de negocios */}
      <Card>
        <CardHeader>
          <CardTitle>Negocios Registrados ({businesses.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Negocio</TableHead>
                  <TableHead>RUC</TableHead>
                  <TableHead>Razón Social</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Método Emisión</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businesses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                      <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p>No hay negocios registrados</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  businesses.map((business) => (
                    <TableRow key={business.id}>
                      <TableCell className="font-medium">
                        {business.businessName || business.tradeName || 'Sin nombre'}
                      </TableCell>
                      <TableCell>{business.ruc || '-'}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {business.legalName || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={business.isActive !== false ? 'success' : 'default'}>
                          {business.isActive !== false ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {business.emissionConfig?.method ? (
                          <Badge variant="primary">
                            {business.emissionConfig.method === 'qpse' && 'QPse'}
                            {business.emissionConfig.method === 'sunat_direct' && 'SUNAT Directo'}
                            {business.emissionConfig.method === 'nubefact' && 'NubeFact'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-500">No configurado</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleBusinessStatus(business.id, business.isActive !== false)}
                            className={`p-2 rounded-lg transition-colors ${
                              business.isActive !== false
                                ? 'hover:bg-yellow-100 text-yellow-600'
                                : 'hover:bg-green-100 text-green-600'
                            }`}
                            title={business.isActive !== false ? 'Desactivar' : 'Activar'}
                          >
                            {business.isActive !== false ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => openConfigModal(business)}
                            className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                            title="Configurar Emisión"
                          >
                            <SettingsIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Configuración de Emisión */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Configurar Emisión - ${selectedBusiness?.businessName || selectedBusiness?.tradeName}`}
        size="large"
      >
        <div className="space-y-6">
          {/* Selección de método */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Método de Emisión
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setEmissionConfig({ ...emissionConfig, method: 'qpse' })}
                className={`p-4 border-2 rounded-lg transition-all ${
                  emissionConfig.method === 'qpse'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold">QPse</p>
                <p className="text-xs text-gray-600">Firma tercerizada</p>
              </button>
              <button
                type="button"
                onClick={() => setEmissionConfig({ ...emissionConfig, method: 'sunat_direct' })}
                className={`p-4 border-2 rounded-lg transition-all ${
                  emissionConfig.method === 'sunat_direct'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold">SUNAT Directo</p>
                <p className="text-xs text-gray-600">CDT propio</p>
              </button>
              <button
                type="button"
                onClick={() => setEmissionConfig({ ...emissionConfig, method: 'nubefact' })}
                className={`p-4 border-2 rounded-lg transition-all ${
                  emissionConfig.method === 'nubefact'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold">NubeFact</p>
                <p className="text-xs text-gray-600">PSE alternativo</p>
              </button>
            </div>
          </div>

          {/* Configuración QPse */}
          {emissionConfig.method === 'qpse' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-gray-900">Credenciales QPse</h3>

              <Input
                label="Usuario QPse"
                placeholder="usuario@ejemplo.com"
                value={emissionConfig.qpse.usuario}
                onChange={(e) => setEmissionConfig({
                  ...emissionConfig,
                  qpse: { ...emissionConfig.qpse, usuario: e.target.value }
                })}
              />

              <div className="relative">
                <Input
                  label="Contraseña QPse"
                  type={showPasswords ? 'text' : 'password'}
                  placeholder="Contraseña"
                  value={emissionConfig.qpse.password}
                  onChange={(e) => setEmissionConfig({
                    ...emissionConfig,
                    qpse: { ...emissionConfig.qpse, password: e.target.value }
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                >
                  {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ambiente
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEmissionConfig({
                      ...emissionConfig,
                      qpse: { ...emissionConfig.qpse, environment: 'demo' }
                    })}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                      emissionConfig.qpse.environment === 'demo'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmissionConfig({
                      ...emissionConfig,
                      qpse: { ...emissionConfig.qpse, environment: 'production' }
                    })}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                      emissionConfig.qpse.environment === 'production'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Producción
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Configuración SUNAT Directo */}
          {emissionConfig.method === 'sunat_direct' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-gray-900">Credenciales SUNAT</h3>

              <Input
                label="RUC"
                placeholder="20123456789"
                value={emissionConfig.sunat.ruc}
                onChange={(e) => setEmissionConfig({
                  ...emissionConfig,
                  sunat: { ...emissionConfig.sunat, ruc: e.target.value }
                })}
              />

              <Input
                label="Usuario SOL"
                placeholder="MODDATOS"
                value={emissionConfig.sunat.usuario}
                onChange={(e) => setEmissionConfig({
                  ...emissionConfig,
                  sunat: { ...emissionConfig.sunat, usuario: e.target.value }
                })}
              />

              <div className="relative">
                <Input
                  label="Contraseña SOL"
                  type={showPasswords ? 'text' : 'password'}
                  placeholder="Contraseña"
                  value={emissionConfig.sunat.password}
                  onChange={(e) => setEmissionConfig({
                    ...emissionConfig,
                    sunat: { ...emissionConfig.sunat, password: e.target.value }
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                >
                  {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Nota:</strong> También necesitarás subir el certificado digital (CDT) del negocio
                </p>
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveConfig}
              className="flex-1"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Configuración
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
