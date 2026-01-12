import { useState, useEffect } from 'react'
import { FlaskConical, Plus, Search, Edit2, Trash2, Phone, Mail, Globe, MapPin, User, FileText } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

function Laboratories() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const [laboratories, setLaboratories] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingLab, setEditingLab] = useState(null)
  const [saving, setSaving] = useState(false)
  const [productCounts, setProductCounts] = useState({}) // Contador de productos por laboratorio
  const [formData, setFormData] = useState({
    name: '',
    ruc: '',
    country: 'Perú',
    address: '',
    phone: '',
    email: '',
    website: '',
    contactPerson: '',
    notes: ''
  })

  const businessId = getBusinessId()

  useEffect(() => {
    if (isDemoMode) {
      loadDemoLaboratories()
    } else if (businessId) {
      loadLaboratories()
    }
  }, [businessId, isDemoMode])

  // Cargar laboratorios del demo
  const loadDemoLaboratories = () => {
    setLoading(true)
    try {
      // Usar datos del contexto demo
      const labsData = demoData?.laboratories || []
      setLaboratories(labsData)

      // Contar productos por laboratorio
      const products = demoData?.products || []
      const counts = {}
      products.forEach(product => {
        if (product.laboratoryId) {
          counts[product.laboratoryId] = (counts[product.laboratoryId] || 0) + 1
        }
      })
      setProductCounts(counts)
    } catch (error) {
      console.error('Error al cargar laboratorios demo:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadLaboratories = async () => {
    if (!businessId) return

    try {
      setLoading(true)
      const labsRef = collection(db, 'businesses', businessId, 'laboratories')
      const snapshot = await getDocs(labsRef)
      const labsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setLaboratories(labsData)

      // Contar productos por laboratorio
      const productsRef = collection(db, 'businesses', businessId, 'products')
      const productsSnapshot = await getDocs(productsRef)
      const counts = {}
      productsSnapshot.docs.forEach(doc => {
        const data = doc.data()
        if (data.laboratoryId) {
          counts[data.laboratoryId] = (counts[data.laboratoryId] || 0) + 1
        }
      })
      setProductCounts(counts)
    } catch (error) {
      console.error('Error al cargar laboratorios:', error)
      toast.error('Error al cargar laboratorios')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('El nombre del laboratorio es requerido')
      return
    }

    // En modo demo, mostrar mensaje y cerrar modal
    if (isDemoMode) {
      toast.info('En modo demo no se pueden guardar cambios')
      setShowModal(false)
      setEditingLab(null)
      resetForm()
      return
    }

    try {
      setSaving(true)
      const labsRef = collection(db, 'businesses', businessId, 'laboratories')

      if (editingLab) {
        // Actualizar
        const labDoc = doc(db, 'businesses', businessId, 'laboratories', editingLab.id)
        await updateDoc(labDoc, {
          ...formData,
          updatedAt: serverTimestamp()
        })
        toast.success('Laboratorio actualizado correctamente')
      } else {
        // Crear nuevo
        await addDoc(labsRef, {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
        toast.success('Laboratorio creado correctamente')
      }

      setShowModal(false)
      setEditingLab(null)
      resetForm()
      loadLaboratories()
    } catch (error) {
      console.error('Error al guardar laboratorio:', error)
      toast.error('Error al guardar laboratorio')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (lab) => {
    setEditingLab(lab)
    setFormData({
      name: lab.name || '',
      ruc: lab.ruc || '',
      country: lab.country || 'Perú',
      address: lab.address || '',
      phone: lab.phone || '',
      email: lab.email || '',
      website: lab.website || '',
      contactPerson: lab.contactPerson || '',
      notes: lab.notes || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (lab) => {
    // En modo demo, mostrar mensaje
    if (isDemoMode) {
      toast.info('En modo demo no se pueden eliminar laboratorios')
      return
    }

    // Verificar si tiene productos asociados
    if (productCounts[lab.id] > 0) {
      toast.error(`No se puede eliminar. Este laboratorio tiene ${productCounts[lab.id]} producto(s) asociado(s)`)
      return
    }

    if (!confirm(`¿Estás seguro de eliminar el laboratorio "${lab.name}"?`)) return

    try {
      const labDoc = doc(db, 'businesses', businessId, 'laboratories', lab.id)
      await deleteDoc(labDoc)
      toast.success('Laboratorio eliminado')
      loadLaboratories()
    } catch (error) {
      console.error('Error al eliminar laboratorio:', error)
      toast.error('Error al eliminar laboratorio')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      ruc: '',
      country: 'Perú',
      address: '',
      phone: '',
      email: '',
      website: '',
      contactPerson: '',
      notes: ''
    })
  }

  const filteredLabs = laboratories.filter(lab =>
    lab.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lab.ruc?.includes(searchTerm) ||
    lab.country?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FlaskConical className="w-7 h-7 text-green-600" />
            Laboratorios
          </h1>
          <p className="text-gray-600 mt-1">
            Gestiona los laboratorios fabricantes de medicamentos
          </p>
        </div>
        <button
          onClick={() => {
            setEditingLab(null)
            resetForm()
            setShowModal(true)
          }}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo Laboratorio
        </button>
      </div>

      {/* Buscador */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, RUC o país..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Total Laboratorios</p>
          <p className="text-2xl font-bold text-gray-900">{laboratories.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Nacionales</p>
          <p className="text-2xl font-bold text-green-600">
            {laboratories.filter(l => l.country === 'Perú').length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Extranjeros</p>
          <p className="text-2xl font-bold text-blue-600">
            {laboratories.filter(l => l.country && l.country !== 'Perú').length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Con Productos</p>
          <p className="text-2xl font-bold text-purple-600">
            {Object.keys(productCounts).length}
          </p>
        </div>
      </div>

      {/* Lista de laboratorios */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando laboratorios...</p>
        </div>
      ) : filteredLabs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FlaskConical className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron laboratorios' : 'No hay laboratorios registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza agregando los laboratorios fabricantes de tus medicamentos'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => {
                  setEditingLab(null)
                  resetForm()
                  setShowModal(true)
                }}
                className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                <Plus className="w-5 h-5" />
                Agregar Laboratorio
              </button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLabs.map(lab => (
            <Card key={lab.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FlaskConical className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{lab.name}</h3>
                      {lab.ruc && (
                        <p className="text-sm text-gray-500">RUC: {lab.ruc}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(lab)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(lab)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  {lab.country && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Globe className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{lab.country}</span>
                    </div>
                  )}
                  {lab.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{lab.phone}</span>
                    </div>
                  )}
                  {lab.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{lab.email}</span>
                    </div>
                  )}
                  {lab.contactPerson && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <User className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{lab.contactPerson}</span>
                    </div>
                  )}
                </div>

                {/* Contador de productos */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Productos asociados:</span>
                    <span className={`font-medium ${productCounts[lab.id] ? 'text-green-600' : 'text-gray-400'}`}>
                      {productCounts[lab.id] || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de creación/edición */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-green-600" />
                {editingLab ? 'Editar Laboratorio' : 'Nuevo Laboratorio'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Laboratorio *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Ej: Laboratorios Portugal"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RUC
                  </label>
                  <input
                    type="text"
                    value={formData.ruc}
                    onChange={(e) => setFormData({...formData, ruc: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="20123456789"
                    maxLength={11}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    País
                  </label>
                  <select
                    value={formData.country}
                    onChange={(e) => setFormData({...formData, country: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="Perú">Perú</option>
                    <option value="Argentina">Argentina</option>
                    <option value="Brasil">Brasil</option>
                    <option value="Chile">Chile</option>
                    <option value="Colombia">Colombia</option>
                    <option value="Ecuador">Ecuador</option>
                    <option value="México">México</option>
                    <option value="Estados Unidos">Estados Unidos</option>
                    <option value="Alemania">Alemania</option>
                    <option value="India">India</option>
                    <option value="China">China</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Av. Principal 123, Lima"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="01-4567890"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="contacto@laboratorio.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sitio Web
                </label>
                <input
                  type="text"
                  value={formData.website}
                  onChange={(e) => setFormData({...formData, website: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="www.laboratorio.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Persona de Contacto
                </label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Juan Pérez - Representante de ventas"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Notas adicionales sobre el laboratorio..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingLab(null)
                    resetForm()
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : (editingLab ? 'Guardar Cambios' : 'Crear Laboratorio')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Laboratories
