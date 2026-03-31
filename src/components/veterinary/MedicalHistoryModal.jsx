/**
 * Modal de Historia Clínica Veterinaria
 * Muestra historial médico, vacunas y servicios recurrentes de una mascota
 */

import { useState, useEffect } from 'react'
import { X, Plus, Edit, Trash2, Loader2, Stethoscope, Syringe, Calendar, PawPrint, AlertTriangle, Check, Clock, CalendarPlus } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import {
  getMedicalHistory,
  addMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
  getVaccinations,
  addVaccination,
  updateVaccination,
  deleteVaccination,
  getRecurringServices,
  addRecurringService,
  updateRecurringService,
  deleteRecurringService,
  markServiceCompleted,
  CONSULTATION_TYPES,
  COMMON_VACCINES,
  COMMON_RECURRING_SERVICES,
} from '@/services/veterinaryService'
import { createAppointment, SERVICE_TYPES } from '@/services/appointmentService'

export default function MedicalHistoryModal({ isOpen, onClose, customer }) {
  const { getBusinessId } = useAppContext()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('history') // history, vaccines, services
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Data states
  const [medicalHistory, setMedicalHistory] = useState([])
  const [vaccinations, setVaccinations] = useState([])
  const [recurringServices, setRecurringServices] = useState([])
  const [catalogServices, setCatalogServices] = useState([]) // Servicios del catálogo de productos

  // Form states
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({})

  // Scheduling state
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [scheduleData, setScheduleData] = useState({
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '09:00',
    serviceType: 'other',
    serviceName: '',
    servicePrice: '',
    notes: '',
  })

  useEffect(() => {
    if (isOpen && customer?.id) {
      loadAllData()
    }
  }, [isOpen, customer?.id])

  const loadAllData = async () => {
    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const [history, vaccines, services] = await Promise.all([
        getMedicalHistory(businessId, customer.id),
        getVaccinations(businessId, customer.id),
        getRecurringServices(businessId, customer.id),
      ])
      setMedicalHistory(history)
      setVaccinations(vaccines)
      setRecurringServices(services)

      // Cargar servicios del catálogo de productos
      try {
        const productsRef = collection(db, 'businesses', businessId, 'products')
        const productsSnapshot = await getDocs(productsRef)
        const servicesFromCatalog = productsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(p => p.trackStock === false || p.unit?.toLowerCase() === 'servicio')
          .map(p => ({
            name: p.name,
            frequency: 30, // Frecuencia por defecto
            price: p.price || 0,
          }))
        setCatalogServices(servicesFromCatalog)
      } catch (err) {
        console.log('No se pudieron cargar servicios del catálogo:', err)
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (date) => {
    if (!date) return '-'
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const isOverdue = (date) => {
    if (!date) return false
    const d = date.toDate ? date.toDate() : new Date(date)
    return d < new Date()
  }

  const isDueSoon = (date, days = 7) => {
    if (!date) return false
    const d = date.toDate ? date.toDate() : new Date(date)
    const future = new Date()
    future.setDate(future.getDate() + days)
    return d <= future && d >= new Date()
  }

  // ==================== HISTORIAL MÉDICO ====================

  const openHistoryForm = (item = null) => {
    setEditingItem(item)
    setFormData(item ? {
      date: item.date?.toDate ? item.date.toDate().toISOString().split('T')[0] : '',
      type: item.type || 'checkup',
      diagnosis: item.diagnosis || '',
      treatment: item.treatment || '',
      notes: item.notes || '',
      weight: item.weight || '',
      temperature: item.temperature || '',
      veterinarian: item.veterinarian || '',
    } : {
      date: new Date().toISOString().split('T')[0],
      type: 'checkup',
      diagnosis: '',
      treatment: '',
      notes: '',
      weight: customer?.petWeight || '',
      temperature: '',
      veterinarian: '',
    })
    setShowForm(true)
  }

  const saveHistoryRecord = async () => {
    if (!formData.date) {
      toast.error('La fecha es requerida')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      if (editingItem) {
        await updateMedicalRecord(businessId, customer.id, editingItem.id, formData)
        toast.success('Registro actualizado')
      } else {
        await addMedicalRecord(businessId, customer.id, formData)
        toast.success('Registro agregado')
      }
      await loadAllData()
      setShowForm(false)
      setEditingItem(null)
    } catch (error) {
      console.error('Error saving record:', error)
      toast.error('Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteHistoryRecord = async (id) => {
    if (!confirm('¿Eliminar este registro?')) return

    try {
      const businessId = getBusinessId()
      await deleteMedicalRecord(businessId, customer.id, id)
      toast.success('Registro eliminado')
      await loadAllData()
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  // ==================== VACUNAS ====================

  const openVaccineForm = (item = null) => {
    setEditingItem(item)
    setFormData(item ? {
      name: item.name || '',
      dateApplied: item.dateApplied?.toDate ? item.dateApplied.toDate().toISOString().split('T')[0] : '',
      nextDoseDate: item.nextDoseDate?.toDate ? item.nextDoseDate.toDate().toISOString().split('T')[0] : '',
      lot: item.lot || '',
      veterinarian: item.veterinarian || '',
      notes: item.notes || '',
    } : {
      name: '',
      dateApplied: new Date().toISOString().split('T')[0],
      nextDoseDate: '',
      lot: '',
      veterinarian: '',
      notes: '',
    })
    setShowForm(true)
  }

  const selectCommonVaccine = (vaccine) => {
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + vaccine.frequency)
    setFormData({
      ...formData,
      name: vaccine.name,
      nextDoseDate: nextDate.toISOString().split('T')[0],
    })
  }

  const saveVaccination = async () => {
    if (!formData.name || !formData.dateApplied) {
      toast.error('Nombre y fecha de aplicación son requeridos')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      if (editingItem) {
        await updateVaccination(businessId, customer.id, editingItem.id, formData)
        toast.success('Vacuna actualizada')
      } else {
        await addVaccination(businessId, customer.id, formData)
        toast.success('Vacuna registrada')
      }
      await loadAllData()
      setShowForm(false)
      setEditingItem(null)
    } catch (error) {
      console.error('Error saving vaccination:', error)
      toast.error('Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteVaccinationRecord = async (id) => {
    if (!confirm('¿Eliminar esta vacuna?')) return

    try {
      const businessId = getBusinessId()
      await deleteVaccination(businessId, customer.id, id)
      toast.success('Vacuna eliminada')
      await loadAllData()
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  // ==================== SERVICIOS RECURRENTES ====================

  const openServiceForm = (item = null) => {
    setEditingItem(item)
    setFormData(item ? {
      name: item.name || '',
      frequency: item.frequency || 30,
      lastDate: item.lastDate?.toDate ? item.lastDate.toDate().toISOString().split('T')[0] : '',
      nextDate: item.nextDate?.toDate ? item.nextDate.toDate().toISOString().split('T')[0] : '',
      notes: item.notes || '',
    } : {
      name: '',
      frequency: 30,
      lastDate: '',
      nextDate: '',
      notes: '',
    })
    setShowForm(true)
  }

  const selectCommonService = (service) => {
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + service.frequency)
    setFormData({
      ...formData,
      name: service.name,
      frequency: service.frequency,
      nextDate: nextDate.toISOString().split('T')[0],
    })
  }

  const saveService = async () => {
    if (!formData.name || !formData.frequency) {
      toast.error('Nombre y frecuencia son requeridos')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      if (editingItem) {
        await updateRecurringService(businessId, customer.id, editingItem.id, formData)
        toast.success('Servicio actualizado')
      } else {
        await addRecurringService(businessId, customer.id, formData)
        toast.success('Servicio programado')
      }
      await loadAllData()
      setShowForm(false)
      setEditingItem(null)
    } catch (error) {
      console.error('Error saving service:', error)
      toast.error('Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const markAsCompleted = async (serviceId) => {
    try {
      const businessId = getBusinessId()
      await markServiceCompleted(businessId, customer.id, serviceId)
      toast.success('Servicio marcado como realizado')
      await loadAllData()
    } catch (error) {
      toast.error('Error al actualizar')
    }
  }

  const deleteServiceRecord = async (id) => {
    if (!confirm('¿Eliminar este servicio?')) return

    try {
      const businessId = getBusinessId()
      await deleteRecurringService(businessId, customer.id, id)
      toast.success('Servicio eliminado')
      await loadAllData()
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  // ==================== AGENDAR CITA ====================

  const openScheduleForm = (service = null) => {
    const today = new Date().toISOString().split('T')[0]
    if (service) {
      // Pre-cargar datos del servicio seleccionado
      setScheduleData({
        scheduledDate: today,
        scheduledTime: '09:00',
        serviceType: 'other',
        serviceName: service.name,
        servicePrice: service.price || '',
        notes: '',
        recurringServiceId: service.id || null,
      })
    } else {
      setScheduleData({
        scheduledDate: today,
        scheduledTime: '09:00',
        serviceType: 'other',
        serviceName: '',
        servicePrice: '',
        notes: '',
      })
    }
    setShowScheduleForm(true)
  }

  const selectCatalogService = (service) => {
    setScheduleData({
      ...scheduleData,
      serviceName: service.name,
      servicePrice: service.price || '',
    })
  }

  const saveAppointment = async () => {
    if (!scheduleData.serviceName || !scheduleData.scheduledDate) {
      toast.error('Servicio y fecha son requeridos')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()

      // Crear la cita
      await createAppointment(businessId, {
        customerId: customer.id,
        customerName: customer.name,
        petName: customer.petName,
        petSpecies: customer.petSpecies,
        phone: customer.phone,
        serviceType: scheduleData.serviceType,
        serviceName: scheduleData.serviceName,
        servicePrice: parseFloat(scheduleData.servicePrice) || 0,
        scheduledDate: scheduleData.scheduledDate,
        scheduledTime: scheduleData.scheduledTime,
        notes: scheduleData.notes,
        recurringServiceId: scheduleData.recurringServiceId || null,
      })

      // Si no existe el servicio recurrente, crearlo
      if (!scheduleData.recurringServiceId) {
        const nextDate = new Date(scheduleData.scheduledDate)
        nextDate.setDate(nextDate.getDate() + 30)

        await addRecurringService(businessId, customer.id, {
          name: scheduleData.serviceName,
          frequency: 30,
          lastDate: null,
          nextDate: scheduleData.scheduledDate,
        })
      }

      toast.success('Cita agendada exitosamente')
      setShowScheduleForm(false)
      await loadAllData()
    } catch (error) {
      console.error('Error al agendar:', error)
      toast.error('Error al agendar la cita')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  const petSpecies = customer?.petSpecies?.toLowerCase() || 'other'
  const vaccineOptions = COMMON_VACCINES[petSpecies === 'perro' ? 'dog' : petSpecies === 'gato' ? 'cat' : 'other'] || COMMON_VACCINES.other

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-t-xl">
          <div className="flex items-center gap-3">
            <PawPrint className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-semibold">{customer?.petName || 'Mascota'}</h2>
              <p className="text-sm text-primary-100">
                {customer?.petSpecies} {customer?.petBreed && `- ${customer.petBreed}`} | Dueño: {customer?.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => { setActiveTab('history'); setShowForm(false) }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'history' ? 'text-primary-600 border-b-2 border-primary-500 bg-primary-50' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            Historial Médico
            <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{medicalHistory.length}</span>
          </button>
          <button
            onClick={() => { setActiveTab('vaccines'); setShowForm(false) }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'vaccines' ? 'text-primary-600 border-b-2 border-primary-500 bg-primary-50' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Syringe className="w-4 h-4" />
            Vacunas
            <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{vaccinations.length}</span>
          </button>
          <button
            onClick={() => { setActiveTab('services'); setShowForm(false) }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'services' ? 'text-primary-600 border-b-2 border-primary-500 bg-primary-50' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Servicios
            <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{recurringServices.length}</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
          ) : (
            <>
              {/* ==================== HISTORIAL MÉDICO ==================== */}
              {activeTab === 'history' && !showForm && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button
                      onClick={() => openHistoryForm()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Nueva Consulta
                    </button>
                  </div>

                  {medicalHistory.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Stethoscope className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No hay registros médicos</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {medicalHistory.map(record => (
                        <div key={record.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-gray-900">{formatDate(record.date)}</span>
                                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
                                  {CONSULTATION_TYPES.find(t => t.value === record.type)?.label || record.type}
                                </span>
                              </div>
                              {record.diagnosis && (
                                <p className="text-sm text-gray-700"><strong>Diagnóstico:</strong> {record.diagnosis}</p>
                              )}
                              {record.treatment && (
                                <p className="text-sm text-gray-600"><strong>Tratamiento:</strong> {record.treatment}</p>
                              )}
                              {record.notes && (
                                <p className="text-sm text-gray-500 mt-1">{record.notes}</p>
                              )}
                              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                                {record.weight && <span>Peso: {record.weight}</span>}
                                {record.temperature && <span>Temp: {record.temperature}°C</span>}
                                {record.veterinarian && <span>Dr. {record.veterinarian}</span>}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => openHistoryForm(record)} className="p-2 text-gray-400 hover:text-primary-500">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => deleteHistoryRecord(record.id)} className="p-2 text-gray-400 hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Form Historial */}
              {activeTab === 'history' && showForm && (
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900">{editingItem ? 'Editar Consulta' : 'Nueva Consulta'}</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                      <input
                        type="date"
                        value={formData.date || ''}
                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Consulta</label>
                      <select
                        value={formData.type || 'checkup'}
                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        {CONSULTATION_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Diagnóstico</label>
                      <input
                        type="text"
                        value={formData.diagnosis || ''}
                        onChange={e => setFormData({ ...formData, diagnosis: e.target.value })}
                        placeholder="Diagnóstico o motivo de consulta"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tratamiento</label>
                      <textarea
                        value={formData.treatment || ''}
                        onChange={e => setFormData({ ...formData, treatment: e.target.value })}
                        placeholder="Medicamentos, indicaciones, etc."
                        rows={2}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Peso</label>
                      <input
                        type="text"
                        value={formData.weight || ''}
                        onChange={e => setFormData({ ...formData, weight: e.target.value })}
                        placeholder="Ej: 5.5 kg"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Temperatura</label>
                      <input
                        type="text"
                        value={formData.temperature || ''}
                        onChange={e => setFormData({ ...formData, temperature: e.target.value })}
                        placeholder="Ej: 38.5"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Veterinario</label>
                      <input
                        type="text"
                        value={formData.veterinarian || ''}
                        onChange={e => setFormData({ ...formData, veterinarian: e.target.value })}
                        placeholder="Nombre del veterinario"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notas adicionales</label>
                      <textarea
                        value={formData.notes || ''}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Observaciones, recomendaciones..."
                        rows={2}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      onClick={() => { setShowForm(false); setEditingItem(null) }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveHistoryRecord}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                    >
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {/* ==================== VACUNAS ==================== */}
              {activeTab === 'vaccines' && !showForm && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button
                      onClick={() => openVaccineForm()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Registrar Vacuna
                    </button>
                  </div>

                  {vaccinations.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Syringe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No hay vacunas registradas</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {vaccinations.map(vac => (
                        <div key={vac.id} className={`border rounded-lg p-4 ${
                          isOverdue(vac.nextDoseDate) ? 'border-red-300 bg-red-50' :
                          isDueSoon(vac.nextDoseDate) ? 'border-yellow-300 bg-yellow-50' : ''
                        }`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-gray-900">{vac.name}</span>
                                {isOverdue(vac.nextDoseDate) && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                                    <AlertTriangle className="w-3 h-3" /> Vencida
                                  </span>
                                )}
                                {isDueSoon(vac.nextDoseDate) && !isOverdue(vac.nextDoseDate) && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                                    <Clock className="w-3 h-3" /> Próxima
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600">
                                <span>Aplicada: {formatDate(vac.dateApplied)}</span>
                                {vac.nextDoseDate && (
                                  <span className="ml-4">Próxima dosis: <strong>{formatDate(vac.nextDoseDate)}</strong></span>
                                )}
                              </div>
                              {vac.lot && <p className="text-xs text-gray-400 mt-1">Lote: {vac.lot}</p>}
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => openVaccineForm(vac)} className="p-2 text-gray-400 hover:text-primary-500">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => deleteVaccinationRecord(vac.id)} className="p-2 text-gray-400 hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Form Vacunas */}
              {activeTab === 'vaccines' && showForm && (
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900">{editingItem ? 'Editar Vacuna' : 'Registrar Vacuna'}</h3>

                  {/* Vacunas comunes */}
                  {!editingItem && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Vacunas comunes ({customer?.petSpecies || 'General'})</label>
                      <div className="flex flex-wrap gap-2">
                        {vaccineOptions.map((v, idx) => (
                          <button
                            key={v.id || `vaccine-${idx}`}
                            onClick={() => selectCommonVaccine(v)}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                              formData.name === v.name ? 'bg-primary-500 text-white border-primary-500' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            {v.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Vacuna *</label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Nombre de la vacuna"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Aplicación *</label>
                      <input
                        type="date"
                        value={formData.dateApplied || ''}
                        onChange={e => setFormData({ ...formData, dateApplied: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Próxima Dosis</label>
                      <input
                        type="date"
                        value={formData.nextDoseDate || ''}
                        onChange={e => setFormData({ ...formData, nextDoseDate: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lote</label>
                      <input
                        type="text"
                        value={formData.lot || ''}
                        onChange={e => setFormData({ ...formData, lot: e.target.value })}
                        placeholder="Número de lote"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Veterinario</label>
                      <input
                        type="text"
                        value={formData.veterinarian || ''}
                        onChange={e => setFormData({ ...formData, veterinarian: e.target.value })}
                        placeholder="Nombre del veterinario"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      onClick={() => { setShowForm(false); setEditingItem(null) }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveVaccination}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                    >
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {/* ==================== SERVICIOS RECURRENTES ==================== */}
              {activeTab === 'services' && !showForm && !showScheduleForm && (
                <div className="space-y-4">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openScheduleForm()}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      Agendar Cita
                    </button>
                    <button
                      onClick={() => openServiceForm()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Programar Servicio
                    </button>
                  </div>

                  {recurringServices.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No hay servicios programados</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recurringServices.map(svc => (
                        <div key={svc.id} className={`border rounded-lg p-4 ${
                          isOverdue(svc.nextDate) ? 'border-red-300 bg-red-50' :
                          isDueSoon(svc.nextDate) ? 'border-yellow-300 bg-yellow-50' : ''
                        }`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-gray-900">{svc.name}</span>
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                                  Cada {svc.frequency} días
                                </span>
                                {isOverdue(svc.nextDate) && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                                    <AlertTriangle className="w-3 h-3" /> Vencido
                                  </span>
                                )}
                                {isDueSoon(svc.nextDate) && !isOverdue(svc.nextDate) && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                                    <Clock className="w-3 h-3" /> Próximo
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600">
                                {svc.lastDate && <span>Último: {formatDate(svc.lastDate)}</span>}
                                {svc.nextDate && (
                                  <span className="ml-4">Próximo: <strong>{formatDate(svc.nextDate)}</strong></span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => openScheduleForm(svc)}
                                className="p-2 text-gray-400 hover:text-green-500"
                                title="Agendar cita"
                              >
                                <CalendarPlus className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => markAsCompleted(svc.id)}
                                className="p-2 text-gray-400 hover:text-blue-500"
                                title="Marcar como realizado"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => openServiceForm(svc)} className="p-2 text-gray-400 hover:text-primary-500" title="Editar">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => deleteServiceRecord(svc.id)} className="p-2 text-gray-400 hover:text-red-500" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Form Servicios */}
              {activeTab === 'services' && showForm && (
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900">{editingItem ? 'Editar Servicio' : 'Programar Servicio'}</h3>

                  {/* Servicios del catálogo o comunes */}
                  {!editingItem && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {catalogServices.length > 0 ? 'Servicios de tu catálogo' : 'Servicios comunes'}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {(catalogServices.length > 0 ? catalogServices : COMMON_RECURRING_SERVICES).map((s, idx) => (
                          <button
                            key={s.id || `service-${idx}`}
                            onClick={() => selectCommonService(s)}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                              formData.name === s.name ? 'bg-primary-500 text-white border-primary-500' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            {s.name} {s.price ? `(S/${s.price})` : `(${s.frequency}d)`}
                          </button>
                        ))}
                      </div>
                      {catalogServices.length === 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          Tip: Crea servicios en Productos con "No controla stock" para verlos aquí
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Servicio *</label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Baño, Corte de uñas"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia (días) *</label>
                      <input
                        type="number"
                        value={formData.frequency || ''}
                        onChange={e => setFormData({ ...formData, frequency: parseInt(e.target.value) || 0 })}
                        placeholder="30"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Última vez realizado</label>
                      <input
                        type="date"
                        value={formData.lastDate || ''}
                        onChange={e => {
                          const lastDate = e.target.value
                          const nextDate = new Date(lastDate)
                          nextDate.setDate(nextDate.getDate() + (formData.frequency || 30))
                          setFormData({
                            ...formData,
                            lastDate,
                            nextDate: nextDate.toISOString().split('T')[0]
                          })
                        }}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Próxima fecha</label>
                      <input
                        type="date"
                        value={formData.nextDate || ''}
                        onChange={e => setFormData({ ...formData, nextDate: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                      <input
                        type="text"
                        value={formData.notes || ''}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Observaciones adicionales"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      onClick={() => { setShowForm(false); setEditingItem(null) }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveService}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                    >
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {/* Form Agendar Cita */}
              {activeTab === 'services' && showScheduleForm && (
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <CalendarPlus className="w-5 h-5 text-green-500" />
                    Agendar Cita
                  </h3>

                  {/* Servicios del catálogo para seleccionar */}
                  {catalogServices.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Selecciona un servicio</label>
                      <div className="flex flex-wrap gap-2">
                        {catalogServices.map((s, idx) => (
                          <button
                            key={s.id || `catalog-${idx}`}
                            onClick={() => selectCatalogService(s)}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                              scheduleData.serviceName === s.name ? 'bg-green-500 text-white border-green-500' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            {s.name} {s.price ? `(S/${s.price})` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Servicio *</label>
                      <input
                        type="text"
                        value={scheduleData.serviceName}
                        onChange={e => setScheduleData({ ...scheduleData, serviceName: e.target.value })}
                        placeholder="Ej: Baño, Consulta, Vacuna..."
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Precio (S/)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={scheduleData.servicePrice}
                        onChange={e => setScheduleData({ ...scheduleData, servicePrice: e.target.value })}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                      <input
                        type="date"
                        value={scheduleData.scheduledDate}
                        onChange={e => setScheduleData({ ...scheduleData, scheduledDate: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                      <input
                        type="time"
                        value={scheduleData.scheduledTime}
                        onChange={e => setScheduleData({ ...scheduleData, scheduledTime: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                      <textarea
                        value={scheduleData.notes}
                        onChange={e => setScheduleData({ ...scheduleData, notes: e.target.value })}
                        placeholder="Observaciones adicionales..."
                        rows={2}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-700">
                      <strong>Resumen:</strong> {scheduleData.serviceName || '(Sin servicio)'} para {customer?.petName} el{' '}
                      {scheduleData.scheduledDate ? new Date(scheduleData.scheduledDate + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }) : '(Sin fecha)'}{' '}
                      a las {scheduleData.scheduledTime || '--:--'}
                      {scheduleData.servicePrice && ` - S/ ${scheduleData.servicePrice}`}
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      onClick={() => setShowScheduleForm(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveAppointment}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                      <CalendarPlus className="w-4 h-4" />
                      Agendar Cita
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
