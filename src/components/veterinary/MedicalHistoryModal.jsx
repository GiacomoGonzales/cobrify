/**
 * Modal de Historia Clínica Veterinaria - Versión Simple
 * Solo 2 acciones: Crear Recordatorio o Agendar Cita
 * Usa los productos/servicios que el usuario ya tiene creados
 */

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Loader2, PawPrint, Check, Clock, CalendarPlus, History, Search, Syringe, Stethoscope, ShoppingCart } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { db } from '@/lib/firebase'
import { collection, getDocs } from 'firebase/firestore'
import {
  getMedicalHistory,
  addMedicalRecord,
  deleteMedicalRecord,
  getVaccinations,
  addVaccination,
  deleteVaccination,
  getRecurringServices,
  addRecurringService,
  deleteRecurringService,
  markServiceCompleted,
} from '@/services/veterinaryService'
import { createAppointment } from '@/services/appointmentService'
import { normalizePets } from '@/utils/petUtils'

export default function MedicalHistoryModal({ isOpen, onClose, customer }) {
  const { getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Mascota seleccionada (para clientes con múltiples mascotas)
  const [selectedPetIndex, setSelectedPetIndex] = useState(0)

  // Vista: 'main' | 'recurring' | 'appointment'
  const [view, setView] = useState('main')

  // Datos
  const [allRecords, setAllRecords] = useState([])
  const [customerInvoices, setCustomerInvoices] = useState([])
  const [recurringServices, setRecurringServices] = useState([])
  const [products, setProducts] = useState([]) // Productos/servicios del usuario

  // Búsqueda y selección
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedServices, setSelectedServices] = useState([]) // Múltiples servicios

  // Formulario
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    frequency: 30,
    notes: '',
  })

  useEffect(() => {
    if (isOpen && customer?.id) {
      setView('main')
      setSelectedProduct(null)
      setSelectedPetIndex(0)
      setSearchQuery('')
      loadAllData()
      loadProducts()
    }
  }, [isOpen, customer?.id])

  const loadAllData = async () => {
    setIsLoading(true)
    try {
      const businessId = getBusinessId()

      const { collection, query, where, getDocs, orderBy } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')

      const [history, vaccines, recurring] = await Promise.all([
        getMedicalHistory(businessId, customer.id),
        getVaccinations(businessId, customer.id),
        getRecurringServices(businessId, customer.id),
      ])

      // Cargar ventas del cliente
      try {
        let invoices = []

        // 1. Buscar por customerId (principal)
        if (customer.id) {
          const invoicesRef = collection(db, 'businesses', businessId, 'invoices')
          const q = query(invoicesRef, where('customerId', '==', customer.id))
          const snapshot = await getDocs(q)
          invoices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        }

        // 2. Fallback: buscar por documentNumber si no hay resultados por customerId
        // (solo si tiene un documento real, no '00000000')
        if (invoices.length === 0 && customer.documentNumber && customer.documentNumber !== '00000000') {
          const invoicesRef = collection(db, 'businesses', businessId, 'invoices')
          const q = query(invoicesRef, where('customer.documentNumber', '==', customer.documentNumber))
          const snapshot = await getDocs(q)
          invoices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        }

        // Ordenar por fecha descendente
        invoices.sort((a, b) => {
          const dA = a.createdAt?.toDate?.() || new Date(0)
          const dB = b.createdAt?.toDate?.() || new Date(0)
          return dB - dA
        })
        setCustomerInvoices(invoices)
      } catch (e) {
        console.warn('Error cargando ventas del cliente:', e)
      }

      // Unificar historial
      const unified = [
        ...history.map(r => ({ ...r, recordType: 'history', sortDate: r.date })),
        ...vaccines.map(v => ({ ...v, recordType: 'vaccine', sortDate: v.dateApplied })),
      ].sort((a, b) => {
        const dateA = a.sortDate?.toDate ? a.sortDate.toDate() : new Date(a.sortDate)
        const dateB = b.sortDate?.toDate ? b.sortDate.toDate() : new Date(b.sortDate)
        return dateB - dateA
      })

      setAllRecords(unified)
      setRecurringServices(recurring)
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  const loadProducts = async () => {
    try {
      // Si es demo, usar productos del demo
      if (isDemoMode && demoData?.products) {
        setProducts(demoData.products)
        return
      }

      const businessId = getBusinessId()
      const productsRef = collection(db, 'businesses', businessId, 'products')
      const snapshot = await getDocs(productsRef)
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setProducts(prods)
    } catch (error) {
      console.log('Error loading products:', error)
    }
  }

  const formatDate = (date) => {
    if (!date) return '-'
    const d = date?.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const isOverdue = (date) => {
    if (!date) return false
    const d = date?.toDate ? date.toDate() : new Date(date)
    return d < new Date()
  }

  // Filtrar productos por búsqueda
  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Seleccionar producto
  const handleSelectProduct = (product) => {
    setSelectedProduct(product)
    setSearchQuery(product.name)
  }

  // Agregar servicio a la lista de la cita
  const handleAddService = (product) => {
    if (selectedServices.some(s => s.id === product.id)) return // ya está agregado
    setSelectedServices([...selectedServices, { id: product.id, name: product.name, price: product.price || 0 }])
    setSearchQuery('')
  }

  const handleRemoveService = (productId) => {
    setSelectedServices(selectedServices.filter(s => s.id !== productId))
  }

  // Guardar recordatorio
  const saveRecurring = async () => {
    if (!selectedProduct) {
      toast.error('Selecciona un producto o servicio')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + (formData.frequency || 30))

      await addRecurringService(businessId, customer.id, {
        name: selectedProduct.name,
        productId: selectedProduct.id,
        frequency: formData.frequency || 30,
        lastDate: null,
        nextDate: nextDate.toISOString().split('T')[0],
        notes: formData.notes,
        price: selectedProduct.price || 0,
      })

      toast.success('Recordatorio creado')
      await loadAllData()
      setView('main')
      setSelectedProduct(null)
      setSearchQuery('')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  // Guardar cita
  const saveAppointment = async () => {
    if (selectedServices.length === 0) {
      toast.error('Agrega al menos un servicio')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const totalPrice = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0)

      const customerPets = normalizePets(customer)
      const currentPet = customerPets[selectedPetIndex] || customerPets[0] || {}

      await createAppointment(businessId, {
        customerId: customer.id,
        customerName: customer.name,
        petName: currentPet.name || customer.petName || '',
        petSpecies: currentPet.species || customer.petSpecies || '',
        petId: currentPet.id || null,
        phone: customer.phone,
        // Compatibilidad: primer servicio como principal
        serviceName: selectedServices.map(s => s.name).join(', '),
        servicePrice: totalPrice,
        // Array de servicios
        services: selectedServices,
        scheduledDate: formData.date,
        scheduledTime: formData.time,
        notes: formData.notes,
      })

      toast.success('Cita agendada')
      await loadAllData()
      setView('main')
      setSelectedServices([])
      setSearchQuery('')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  // Marcar recordatorio como completado
  const handleMarkCompleted = async (service) => {
    try {
      const businessId = getBusinessId()
      await markServiceCompleted(businessId, customer.id, service.id)
      toast.success('Marcado como realizado')
      await loadAllData()
    } catch (error) {
      toast.error('Error al actualizar')
    }
  }

  // Eliminar recordatorio
  const handleDeleteRecurring = async (serviceId) => {
    if (!confirm('¿Eliminar este recordatorio?')) return
    try {
      const businessId = getBusinessId()
      await deleteRecurringService(businessId, customer.id, serviceId)
      toast.success('Eliminado')
      await loadAllData()
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  // Eliminar registro del historial
  const handleDeleteRecord = async (record) => {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      const businessId = getBusinessId()
      if (record.recordType === 'vaccine') {
        await deleteVaccination(businessId, customer.id, record.id)
      } else {
        await deleteMedicalRecord(businessId, customer.id, record.id)
      }
      toast.success('Eliminado')
      await loadAllData()
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl h-[85vh] flex flex-col">
        {/* Header */}
        {(() => {
          const customerPets = normalizePets(customer)
          const currentPet = customerPets[selectedPetIndex] || customerPets[0] || {}
          return (
            <div className="border-b border-gray-200 rounded-t-xl">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <PawPrint className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{currentPet.name || 'Mascota'}</h2>
                    <p className="text-sm text-gray-500 truncate">
                      {currentPet.species}{currentPet.breed ? ` • ${currentPet.breed}` : ''}{customer?.name ? ` · ${customer.name}` : ''}
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {customerPets.length > 1 && (
                <div className="flex gap-1 px-4 py-2 bg-gray-50 overflow-x-auto">
                  {customerPets.map((pet, idx) => (
                    <button
                      key={pet.id || idx}
                      onClick={() => setSelectedPetIndex(idx)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                        idx === selectedPetIndex
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <PawPrint className="w-3 h-3" />
                      {pet.name}
                      {pet.species && <span className="opacity-75">({pet.species})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
          ) : (
            <>
              {/* ==================== VISTA PRINCIPAL ==================== */}
              {view === 'main' && (
                <div className="space-y-4">
                  {/* Botones principales */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        setView('recurring')
                        setSelectedProduct(null)
                        setSearchQuery('')
                        setFormData({ ...formData, frequency: 30 })
                      }}
                      className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-primary-300 hover:bg-gray-50 transition-colors"
                    >
                      <Clock className="w-7 h-7 text-primary-600" />
                      <span className="font-medium text-gray-800">Crear Recordatorio</span>
                    </button>

                    <button
                      onClick={() => {
                        setView('appointment')
                        setSelectedProduct(null)
                        setSearchQuery('')
                        setFormData({ ...formData, date: new Date().toISOString().split('T')[0], time: '09:00' })
                      }}
                      className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-primary-300 hover:bg-gray-50 transition-colors"
                    >
                      <CalendarPlus className="w-7 h-7 text-primary-600" />
                      <span className="font-medium text-gray-800">Agendar Cita</span>
                    </button>
                  </div>

                  {/* Recordatorios activos */}
                  {recurringServices.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <h3 className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Recordatorios Activos
                      </h3>
                      <div className="space-y-2">
                        {recurringServices.map(svc => (
                          <div key={svc.id} className={`flex items-center justify-between p-2 rounded-lg ${
                            isOverdue(svc.nextDate) ? 'bg-red-100' : 'bg-white'
                          }`}>
                            <div>
                              <span className="font-medium text-gray-900">{svc.name}</span>
                              <span className="text-xs text-gray-500 ml-2">
                                {formatDate(svc.nextDate)}
                                {isOverdue(svc.nextDate) && <span className="text-red-600 ml-1">• Vencido</span>}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleMarkCompleted(svc)}
                                className="p-1.5 text-green-600 hover:bg-green-100 rounded"
                                title="Marcar realizado"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteRecurring(svc.id)}
                                className="p-1.5 text-red-500 hover:bg-red-100 rounded"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Historial */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      Historial clínico
                    </h3>

                    {allRecords.length === 0 ? (
                      <div className="text-center py-6 text-gray-500">
                        <PawPrint className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">Sin consultas ni vacunas registradas</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {allRecords.slice(0, 10).map(record => (
                          <div key={record.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                            <div className={`p-1.5 rounded ${record.recordType === 'vaccine' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                              {record.recordType === 'vaccine' ? <Syringe className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-gray-900 text-sm">
                                {record.recordType === 'vaccine' ? record.name : (record.diagnosis || record.type)}
                              </span>
                              <span className="text-xs text-gray-400 ml-2">{formatDate(record.sortDate)}</span>
                            </div>
                            <button
                              onClick={() => handleDeleteRecord(record)}
                              className="p-1 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Historial de Ventas */}
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4" />
                      Ventas ({customerInvoices.length})
                    </h3>

                    {customerInvoices.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">Sin ventas registradas</p>
                    ) : (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {customerInvoices.map(inv => {
                          const date = inv.emissionDate
                            ? (typeof inv.emissionDate === 'string' ? new Date(inv.emissionDate + 'T12:00:00') : inv.emissionDate?.toDate?.() || new Date(inv.emissionDate))
                            : inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
                          const items = inv.items || []
                          const isVoided = inv.status === 'cancelled' || inv.status === 'voided'

                          return (
                            <div key={inv.id} className={`p-2.5 bg-gray-50 rounded-lg border border-gray-100 ${isVoided ? 'opacity-50' : ''}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-primary-600">{inv.number || '-'}</span>
                                <span className="text-xs text-gray-400">{date ? date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</span>
                              </div>
                              <div className="space-y-0.5">
                                {items.slice(0, 5).map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-xs">
                                    <span className="text-gray-700 truncate flex-1">{item.quantity}x {item.name || item.description || 'Producto'}</span>
                                    <span className="text-gray-500 ml-2 flex-shrink-0">S/{(item.subtotal != null ? item.subtotal : (item.unitPrice || item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                                  </div>
                                ))}
                                {items.length > 5 && <p className="text-xs text-gray-400">+{items.length - 5} más</p>}
                              </div>
                              <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-200">
                                <span className="text-xs text-gray-500">{inv.paymentMethod || inv.payments?.map(p => p.method).join(', ') || '-'}</span>
                                <span className="text-xs font-bold text-gray-900">S/{(inv.total || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== CREAR RECORDATORIO ==================== */}
              {view === 'recurring' && (
                <div className="space-y-4">
                  <button onClick={() => setView('main')} className="text-sm text-gray-500 hover:text-gray-700">
                    ← Volver
                  </button>

                  <div className="flex items-center gap-2 text-amber-700">
                    <Clock className="w-5 h-5" />
                    <h3 className="font-medium">Crear Recordatorio</h3>
                  </div>

                  {/* Barra de búsqueda */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar producto o servicio..."
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value)
                        setSelectedProduct(null)
                      }}
                      className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>

                  {/* Resultados de búsqueda */}
                  {searchQuery && !selectedProduct && (
                    <div className="border rounded-xl max-h-48 overflow-y-auto">
                      {filteredProducts.length === 0 ? (
                        <p className="p-3 text-sm text-gray-500">No se encontraron productos</p>
                      ) : (
                        filteredProducts.map(product => (
                          <button
                            key={product.id}
                            onClick={() => handleSelectProduct(product)}
                            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 border-b last:border-b-0 text-left"
                          >
                            <span className="font-medium text-gray-900">{product.name}</span>
                            {product.price > 0 && <span className="text-sm text-gray-500">S/{product.price}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Producto seleccionado */}
                  {selectedProduct && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-sm text-amber-600">Seleccionado:</p>
                      <p className="font-medium text-amber-800">{selectedProduct.name}</p>
                      {selectedProduct.price > 0 && (
                        <p className="text-sm text-amber-600">Precio: S/{selectedProduct.price}</p>
                      )}
                    </div>
                  )}

                  {/* Frecuencia */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recordar cada:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={formData.frequency}
                        onChange={e => setFormData({ ...formData, frequency: parseInt(e.target.value) || 30 })}
                        className="w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-gray-600">días</span>
                    </div>
                  </div>

                  {/* Notas */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                    <input
                      type="text"
                      value={formData.notes}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Observaciones..."
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {/* Resumen */}
                  {selectedProduct && (
                    <div className="bg-gray-50 rounded-xl p-3 text-sm">
                      <p className="text-gray-600">
                        Próximo recordatorio: <strong>{new Date(Date.now() + formData.frequency * 24 * 60 * 60 * 1000).toLocaleDateString('es-PE')}</strong>
                      </p>
                    </div>
                  )}

                  {/* Botón guardar */}
                  <button
                    onClick={saveRecurring}
                    disabled={isSaving || !selectedProduct}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium"
                  >
                    {isSaving && <Loader2 className="w-5 h-5 animate-spin" />}
                    Crear Recordatorio
                  </button>
                </div>
              )}

              {/* ==================== AGENDAR CITA ==================== */}
              {view === 'appointment' && (
                <div className="space-y-4">
                  <button onClick={() => setView('main')} className="text-sm text-gray-500 hover:text-gray-700">
                    ← Volver
                  </button>

                  <div className="flex items-center gap-2 text-green-700">
                    <CalendarPlus className="w-5 h-5" />
                    <h3 className="font-medium">Agendar Cita</h3>
                  </div>

                  {/* Servicios seleccionados */}
                  {selectedServices.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Servicios ({selectedServices.length})</p>
                      {selectedServices.map(service => (
                        <div key={service.id} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-2.5">
                          <div>
                            <p className="font-medium text-green-800 text-sm">{service.name}</p>
                            {service.price > 0 && <p className="text-xs text-green-600">S/{service.price.toFixed(2)}</p>}
                          </div>
                          <button onClick={() => handleRemoveService(service.id)} className="text-red-400 hover:text-red-600 p-1">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <div className="text-right text-sm font-medium text-gray-700">
                        Total: S/{selectedServices.reduce((sum, s) => sum + (s.price || 0), 0).toFixed(2)}
                      </div>
                    </div>
                  )}

                  {/* Barra de búsqueda para agregar servicio */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar y agregar servicio..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  {/* Resultados de búsqueda */}
                  {searchQuery && (
                    <div className="border rounded-xl max-h-48 overflow-y-auto">
                      {filteredProducts.length === 0 ? (
                        <p className="p-3 text-sm text-gray-500">No se encontraron productos</p>
                      ) : (
                        filteredProducts
                          .filter(p => !selectedServices.some(s => s.id === p.id))
                          .map(product => (
                          <button
                            key={product.id}
                            onClick={() => handleAddService(product)}
                            className="w-full flex items-center justify-between p-3 hover:bg-green-50 border-b last:border-b-0 text-left"
                          >
                            <span className="font-medium text-gray-900">{product.name}</span>
                            <div className="flex items-center gap-2">
                              {product.price > 0 && <span className="text-sm text-gray-500">S/{product.price}</span>}
                              <Plus className="w-4 h-4 text-green-500" />
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Fecha y hora */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                      <input
                        type="time"
                        value={formData.time}
                        onChange={e => setFormData({ ...formData, time: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  {/* Notas */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                    <input
                      type="text"
                      value={formData.notes}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Observaciones..."
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  {/* Resumen */}
                  {selectedServices.length > 0 && formData.date && (
                    <div className="bg-gray-50 rounded-xl p-3 text-sm">
                      <p className="text-gray-600">
                        Cita: <strong>{selectedServices.map(s => s.name).join(', ')}</strong> para {customer?.petName}
                      </p>
                      <p className="text-gray-600">
                        {new Date(formData.date + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })} a las {formData.time}
                      </p>
                    </div>
                  )}

                  {/* Botón guardar */}
                  <button
                    onClick={saveAppointment}
                    disabled={isSaving || selectedServices.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors font-medium"
                  >
                    {isSaving && <Loader2 className="w-5 h-5 animate-spin" />}
                    Agendar Cita
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
