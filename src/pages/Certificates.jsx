import { useState, useEffect } from 'react'
import {
  FileText,
  Plus,
  Search,
  Download,
  Eye,
  Trash2,
  Loader2,
  Calendar,
  Building2,
  GraduationCap,
  ClipboardCheck,
  X,
  UserPlus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Pencil
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { db } from '@/lib/firebase'
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  where,
  limit
} from 'firebase/firestore'
import { getCustomers } from '@/services/firestoreService'
import { consultarRUC, consultarDNI } from '@/services/documentLookupService'
import { generateTrainingCertificatePDF, generateOperabilityCertificatePDF } from '@/utils/certificatePdfGenerator'

// Tipos de extintor más comunes en Perú
const EXTINGUISHER_TYPES = [
  { value: 'PQS', label: 'PQS (Polvo Químico Seco)' },
  { value: 'CO2', label: 'CO2 (Dióxido de Carbono)' },
  { value: 'AGUA', label: 'Agua Presurizada' },
  { value: 'AFFF', label: 'AFFF (Espuma)' },
  { value: 'ACETATO', label: 'Acetato de Potasio (Clase K)' },
  { value: 'HALOTRON', label: 'Halotron' }
]

// Capacidades comunes
const CAPACITIES = ['1 kg', '2 kg', '4 kg', '6 kg', '9 kg', '12 kg', '25 kg', '50 kg', '2 lb', '5 lb', '10 lb', '20 lb']

// Temas de capacitación predefinidos según NTP 350.043-1
const DEFAULT_TRAINING_TOPICS = [
  'Teoría del fuego y clases de fuego',
  'Tipos de extintores y agentes extintores',
  'Técnicas de uso de extintores (P.A.S.S.)',
  'Inspección visual de extintores',
  'Procedimientos de evacuación',
  'Normativa NTP 350.043-1',
  'Práctica con fuego controlado'
]

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
        { type: 'PQS', capacity: '6 kg', serial: 'EXT-001', brand: 'Badger', location: 'Cocina', serviceType: 'recarga' },
        { type: 'CO2', capacity: '5 kg', serial: 'EXT-002', brand: 'Amerex', location: 'Oficina', serviceType: 'recarga' },
        { type: 'PQS', capacity: '4 kg', serial: 'EXT-003', brand: 'Badger', location: 'Almacén', serviceType: 'mantenimiento' }
      ],
      status: 'active',
      createdAt: new Date(2024, 5, 10).toISOString()
    }
  ]
}

// Estado inicial para formulario de capacitación
const INITIAL_TRAINING_FORM = {
  customerId: '',
  customerName: '',
  customerRuc: '',
  customerAddress: '',
  date: new Date().toISOString().split('T')[0],
  duration: '90 minutos',
  instructor: '',
  trainingTitle: 'USO Y MANEJO CORRECTO DEL EXTINTOR',
  topics: [],
  participants: [{ name: '', dni: '' }]
}

// Estado inicial para formulario de operatividad
const INITIAL_OPERABILITY_FORM = {
  customerId: '',
  customerName: '',
  customerRuc: '',
  customerAddress: '',
  serviceDate: new Date().toISOString().split('T')[0],
  expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  technician: '',
  guaranteePeriod: '12 meses',
  extinguishers: [{
    type: 'PQS',
    capacity: '6 kg',
    serial: '',
    brand: '',
    location: '',
    serviceType: 'recarga',
    fabricationDate: '',
    nextHydrostaticTest: ''
  }]
}

export default function Certificates() {
  const { isDemoMode, getBusinessId, businessSettings } = useAppContext()
  const toast = useToast()

  // Estados principales
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('training')
  const [searchTerm, setSearchTerm] = useState('')
  const [certificates, setCertificates] = useState({ training: [], operability: [] })
  const [customers, setCustomers] = useState([])

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTrainingForm, setShowTrainingForm] = useState(false)
  const [showOperabilityForm, setShowOperabilityForm] = useState(false)
  const [viewingCertificate, setViewingCertificate] = useState(null)
  const [deletingCertificate, setDeletingCertificate] = useState(null)
  const [editingCertificateId, setEditingCertificateId] = useState(null)

  // Formularios
  const [trainingForm, setTrainingForm] = useState(INITIAL_TRAINING_FORM)
  const [operabilityForm, setOperabilityForm] = useState(INITIAL_OPERABILITY_FORM)

  // Búsqueda de clientes
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Estados para búsqueda de RUC/DNI
  const [isSearchingRuc, setIsSearchingRuc] = useState(false)
  const [rucInput, setRucInput] = useState('')
  const [searchingDniIndex, setSearchingDniIndex] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const businessId = getBusinessId()

      if (isDemoMode) {
        setCertificates(DEMO_CERTIFICATES)
        setCustomers([
          { id: 'demo-1', businessName: 'Restaurante El Buen Sabor S.A.C.', documentNumber: '20123456789', address: 'Av. Larco 123, Miraflores' },
          { id: 'demo-2', businessName: 'Farmacia San Pedro E.I.R.L.', documentNumber: '20987654321', address: 'Jr. Cusco 456, Lima' }
        ])
      } else {
        // Cargar certificados desde Firestore
        await loadCertificates(businessId)

        // Cargar clientes
        const customersResult = await getCustomers(businessId)
        if (customersResult.success) {
          setCustomers(customersResult.data || [])
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  const loadCertificates = async (businessId) => {
    try {
      // Cargar certificados de capacitación
      const trainingRef = collection(db, 'businesses', businessId, 'certificates_training')
      const trainingQuery = query(trainingRef, orderBy('createdAt', 'desc'))
      const trainingSnapshot = await getDocs(trainingQuery)
      const trainingCerts = trainingSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'training',
        ...doc.data()
      }))

      // Cargar certificados de operatividad
      const operabilityRef = collection(db, 'businesses', businessId, 'certificates_operability')
      const operabilityQuery = query(operabilityRef, orderBy('createdAt', 'desc'))
      const operabilitySnapshot = await getDocs(operabilityQuery)
      const operabilityCerts = operabilitySnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'operability',
        ...doc.data()
      }))

      setCertificates({
        training: trainingCerts,
        operability: operabilityCerts
      })
    } catch (error) {
      console.error('Error loading certificates:', error)
      throw error
    }
  }

  // Generar número de certificado automático
  const generateCertificateNumber = async (type) => {
    const prefix = type === 'training' ? 'CAP' : 'OPE'
    const year = new Date().getFullYear()
    const businessId = getBusinessId()

    if (isDemoMode) {
      const count = certificates[type]?.length || 0
      return `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`
    }

    try {
      // Obtener el último certificado del año para generar el siguiente número
      const collectionName = type === 'training' ? 'certificates_training' : 'certificates_operability'
      const certsRef = collection(db, 'businesses', businessId, collectionName)
      const q = query(
        certsRef,
        where('certificateNumber', '>=', `${prefix}-${year}-`),
        where('certificateNumber', '<=', `${prefix}-${year}-\uf8ff`),
        orderBy('certificateNumber', 'desc'),
        limit(1)
      )
      const snapshot = await getDocs(q)

      let nextNumber = 1
      if (!snapshot.empty) {
        const lastCert = snapshot.docs[0].data()
        const lastNumber = parseInt(lastCert.certificateNumber.split('-')[2]) || 0
        nextNumber = lastNumber + 1
      }

      return `${prefix}-${year}-${String(nextNumber).padStart(3, '0')}`
    } catch (error) {
      console.error('Error generating certificate number:', error)
      // Fallback: usar timestamp
      return `${prefix}-${year}-${Date.now().toString().slice(-6)}`
    }
  }

  // Seleccionar cliente
  const selectCustomer = (customer, formType) => {
    const customerData = {
      customerId: customer.id,
      customerName: customer.businessName || customer.name || '',
      customerRuc: customer.documentNumber || '',
      customerAddress: customer.address || ''
    }

    if (formType === 'training') {
      setTrainingForm(prev => ({ ...prev, ...customerData }))
    } else {
      setOperabilityForm(prev => ({ ...prev, ...customerData }))
    }
    setCustomerSearchTerm('')
    setShowCustomerDropdown(false)
  }

  // Filtrar clientes por búsqueda
  const filteredCustomers = customers.filter(c => {
    if (!customerSearchTerm) return true
    const search = customerSearchTerm.toLowerCase()
    return (
      c.businessName?.toLowerCase().includes(search) ||
      c.name?.toLowerCase().includes(search) ||
      c.documentNumber?.includes(search)
    )
  }).slice(0, 10)

  // Agregar participante (capacitación)
  const addParticipant = () => {
    setTrainingForm(prev => ({
      ...prev,
      participants: [...prev.participants, { name: '', dni: '' }]
    }))
  }

  // Remover participante
  const removeParticipant = (index) => {
    setTrainingForm(prev => ({
      ...prev,
      participants: prev.participants.filter((_, i) => i !== index)
    }))
  }

  // Actualizar participante
  const updateParticipant = (index, field, value) => {
    setTrainingForm(prev => ({
      ...prev,
      participants: prev.participants.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      )
    }))
  }

  // Buscar RUC en SUNAT
  const searchRuc = async (formType) => {
    const ruc = rucInput.replace(/\D/g, '')
    if (ruc.length !== 11) {
      toast.error('El RUC debe tener 11 dígitos')
      return
    }

    setIsSearchingRuc(true)
    try {
      const result = await consultarRUC(ruc)
      if (result.success) {
        const customerData = {
          customerId: '',
          customerName: result.data.razonSocial,
          customerRuc: result.data.ruc,
          customerAddress: result.data.direccion
        }
        if (formType === 'training') {
          setTrainingForm(prev => ({ ...prev, ...customerData }))
        } else {
          setOperabilityForm(prev => ({ ...prev, ...customerData }))
        }
        setRucInput('')
        toast.success('Datos del RUC obtenidos correctamente')
      } else {
        toast.error(result.error || 'No se encontraron datos para este RUC')
      }
    } catch (error) {
      console.error('Error searching RUC:', error)
      toast.error('Error al buscar RUC')
    } finally {
      setIsSearchingRuc(false)
    }
  }

  // Buscar DNI en RENIEC
  const searchDni = async (index) => {
    const dni = trainingForm.participants[index].dni.replace(/\D/g, '')
    if (dni.length !== 8) {
      toast.error('El DNI debe tener 8 dígitos')
      return
    }

    setSearchingDniIndex(index)
    try {
      const result = await consultarDNI(dni)
      if (result.success) {
        updateParticipant(index, 'name', result.data.nombreCompleto)
        toast.success('Datos del DNI obtenidos correctamente')
      } else {
        toast.error(result.error || 'No se encontraron datos para este DNI')
      }
    } catch (error) {
      console.error('Error searching DNI:', error)
      toast.error('Error al buscar DNI')
    } finally {
      setSearchingDniIndex(null)
    }
  }

  // Toggle tema de capacitación
  const toggleTopic = (topic) => {
    setTrainingForm(prev => ({
      ...prev,
      topics: prev.topics.includes(topic)
        ? prev.topics.filter(t => t !== topic)
        : [...prev.topics, topic]
    }))
  }

  // Agregar extintor (operatividad)
  const addExtinguisher = () => {
    setOperabilityForm(prev => ({
      ...prev,
      extinguishers: [...prev.extinguishers, {
        type: 'PQS',
        capacity: '6 kg',
        serial: '',
        brand: '',
        location: '',
        serviceType: 'recarga',
        fabricationDate: '',
        nextHydrostaticTest: ''
      }]
    }))
  }

  // Remover extintor
  const removeExtinguisher = (index) => {
    setOperabilityForm(prev => ({
      ...prev,
      extinguishers: prev.extinguishers.filter((_, i) => i !== index)
    }))
  }

  // Actualizar extintor
  const updateExtinguisher = (index, field, value) => {
    setOperabilityForm(prev => ({
      ...prev,
      extinguishers: prev.extinguishers.map((e, i) =>
        i === index ? { ...e, [field]: value } : e
      )
    }))
  }

  // Editar certificado
  const editCertificate = (certificate) => {
    setViewingCertificate(null)
    setEditingCertificateId(certificate.id)

    if (certificate.type === 'training') {
      setTrainingForm({
        customerId: certificate.customerId || '',
        customerName: certificate.customerName || '',
        customerRuc: certificate.customerRuc || '',
        customerAddress: certificate.customerAddress || '',
        date: certificate.date || new Date().toISOString().split('T')[0],
        duration: certificate.duration || '90 minutos',
        instructor: certificate.instructor || '',
        trainingTitle: certificate.trainingTitle || 'USO Y MANEJO CORRECTO DEL EXTINTOR',
        topics: certificate.topics || [],
        participants: certificate.participants?.length > 0
          ? certificate.participants
          : [{ name: '', dni: '' }]
      })
      setShowTrainingForm(true)
    } else {
      setOperabilityForm({
        customerId: certificate.customerId || '',
        customerName: certificate.customerName || '',
        customerRuc: certificate.customerRuc || '',
        customerAddress: certificate.customerAddress || '',
        serviceDate: certificate.serviceDate || new Date().toISOString().split('T')[0],
        expirationDate: certificate.expirationDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        technician: certificate.technician || '',
        guaranteePeriod: certificate.guaranteePeriod || '12 meses',
        extinguishers: certificate.extinguishers?.length > 0
          ? certificate.extinguishers
          : [{ type: 'PQS', capacity: '6 kg', serial: '', brand: '', location: '', serviceType: 'recarga', fabricationDate: '', nextHydrostaticTest: '' }]
      })
      setShowOperabilityForm(true)
    }
  }

  // Guardar certificado de capacitación
  const saveTrainingCertificate = async () => {
    // Validaciones
    if (!trainingForm.customerName || !trainingForm.customerRuc) {
      toast.error('Selecciona un cliente')
      return
    }
    if (!trainingForm.instructor) {
      toast.error('Ingresa el nombre del instructor')
      return
    }
    if (trainingForm.topics.length === 0) {
      toast.error('Selecciona al menos un tema')
      return
    }
    const validParticipants = trainingForm.participants.filter(p => p.name && p.dni)
    if (validParticipants.length === 0) {
      toast.error('Agrega al menos un participante con nombre y DNI')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const isEditing = !!editingCertificateId

      const certificateData = {
        customerId: trainingForm.customerId,
        customerName: trainingForm.customerName,
        customerRuc: trainingForm.customerRuc,
        customerAddress: trainingForm.customerAddress,
        date: trainingForm.date,
        duration: trainingForm.duration,
        instructor: trainingForm.instructor,
        trainingTitle: trainingForm.trainingTitle,
        topics: trainingForm.topics,
        participants: validParticipants,
        status: 'active',
        updatedAt: serverTimestamp()
      }

      if (isDemoMode) {
        if (isEditing) {
          // Actualizar en modo demo
          setCertificates(prev => ({
            ...prev,
            training: prev.training.map(c =>
              c.id === editingCertificateId ? { ...c, ...certificateData } : c
            )
          }))
        } else {
          // Crear en modo demo
          const certificateNumber = await generateCertificateNumber('training')
          const newCert = {
            id: `demo-${Date.now()}`,
            type: 'training',
            certificateNumber,
            ...certificateData,
            createdAt: new Date().toISOString()
          }
          setCertificates(prev => ({
            ...prev,
            training: [newCert, ...prev.training]
          }))
        }
      } else {
        if (isEditing) {
          // Actualizar en Firestore
          const certRef = doc(db, 'businesses', businessId, 'certificates_training', editingCertificateId)
          await updateDoc(certRef, certificateData)
        } else {
          // Crear en Firestore
          const certificateNumber = await generateCertificateNumber('training')
          await addDoc(collection(db, 'businesses', businessId, 'certificates_training'), {
            ...certificateData,
            certificateNumber,
            createdAt: serverTimestamp()
          })
        }
        await loadCertificates(businessId)
      }

      toast.success(isEditing ? 'Certificado actualizado exitosamente' : 'Certificado creado exitosamente')
      setShowTrainingForm(false)
      setTrainingForm(INITIAL_TRAINING_FORM)
      setEditingCertificateId(null)
      setActiveTab('training')
    } catch (error) {
      console.error('Error saving training certificate:', error)
      toast.error('Error al guardar el certificado')
    } finally {
      setIsSaving(false)
    }
  }

  // Guardar certificado de operatividad
  const saveOperabilityCertificate = async () => {
    // Validaciones
    if (!operabilityForm.customerName || !operabilityForm.customerRuc) {
      toast.error('Selecciona un cliente')
      return
    }
    if (!operabilityForm.technician) {
      toast.error('Ingresa el nombre del técnico')
      return
    }
    const validExtinguishers = operabilityForm.extinguishers.filter(e => e.serial && e.type)
    if (validExtinguishers.length === 0) {
      toast.error('Agrega al menos un extintor con tipo y serie')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const isEditing = !!editingCertificateId

      const certificateData = {
        customerId: operabilityForm.customerId,
        customerName: operabilityForm.customerName,
        customerRuc: operabilityForm.customerRuc,
        customerAddress: operabilityForm.customerAddress,
        serviceDate: operabilityForm.serviceDate,
        expirationDate: operabilityForm.expirationDate,
        technician: operabilityForm.technician,
        guaranteePeriod: operabilityForm.guaranteePeriod,
        extinguishers: validExtinguishers,
        status: 'active',
        updatedAt: serverTimestamp()
      }

      if (isDemoMode) {
        if (isEditing) {
          // Actualizar en modo demo
          setCertificates(prev => ({
            ...prev,
            operability: prev.operability.map(c =>
              c.id === editingCertificateId ? { ...c, ...certificateData } : c
            )
          }))
        } else {
          // Crear en modo demo
          const certificateNumber = await generateCertificateNumber('operability')
          const newCert = {
            id: `demo-${Date.now()}`,
            type: 'operability',
            certificateNumber,
            ...certificateData,
            createdAt: new Date().toISOString()
          }
          setCertificates(prev => ({
            ...prev,
            operability: [newCert, ...prev.operability]
          }))
        }
      } else {
        if (isEditing) {
          // Actualizar en Firestore
          const certRef = doc(db, 'businesses', businessId, 'certificates_operability', editingCertificateId)
          await updateDoc(certRef, certificateData)
        } else {
          // Crear en Firestore
          const certificateNumber = await generateCertificateNumber('operability')
          await addDoc(collection(db, 'businesses', businessId, 'certificates_operability'), {
            ...certificateData,
            certificateNumber,
            createdAt: serverTimestamp()
          })
        }
        await loadCertificates(businessId)
      }

      toast.success(isEditing ? 'Certificado actualizado exitosamente' : 'Certificado creado exitosamente')
      setShowOperabilityForm(false)
      setOperabilityForm(INITIAL_OPERABILITY_FORM)
      setEditingCertificateId(null)
      setActiveTab('operability')
    } catch (error) {
      console.error('Error saving operability certificate:', error)
      toast.error('Error al guardar el certificado')
    } finally {
      setIsSaving(false)
    }
  }

  // Eliminar certificado
  const deleteCertificate = async () => {
    if (!deletingCertificate) return

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const { id, type } = deletingCertificate

      if (isDemoMode) {
        setCertificates(prev => ({
          ...prev,
          [type]: prev[type].filter(c => c.id !== id)
        }))
      } else {
        const collectionName = type === 'training' ? 'certificates_training' : 'certificates_operability'
        await deleteDoc(doc(db, 'businesses', businessId, collectionName, id))
        await loadCertificates(businessId)
      }

      toast.success('Certificado eliminado')
      setDeletingCertificate(null)
    } catch (error) {
      console.error('Error deleting certificate:', error)
      toast.error('Error al eliminar el certificado')
    } finally {
      setIsSaving(false)
    }
  }

  // Descargar PDF del certificado
  const downloadCertificatePDF = async (certificate) => {
    try {
      toast.info('Generando PDF...')

      if (certificate.type === 'training') {
        await generateTrainingCertificatePDF(certificate, businessSettings)
      } else {
        await generateOperabilityCertificatePDF(certificate, businessSettings)
      }

      toast.success('PDF generado correctamente')
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Error al generar el PDF')
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
      const date = new Date(c.createdAt?.seconds ? c.createdAt.seconds * 1000 : c.createdAt)
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
                          <GraduationCap className="w-5 h-5 text-blue-600" />
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
                        title="Ver detalles"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editCertificate({ ...cert, type: activeTab })}
                        title="Editar certificado"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadCertificatePDF({ ...cert, type: activeTab })}
                        title="Descargar PDF"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingCertificate(cert)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Eliminar certificado"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Seleccionar Tipo de Certificado */}
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
                setTrainingForm(INITIAL_TRAINING_FORM)
                setShowTrainingForm(true)
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
                setOperabilityForm(INITIAL_OPERABILITY_FORM)
                setShowOperabilityForm(true)
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

      {/* Modal Formulario Capacitación */}
      <Modal
        isOpen={showTrainingForm}
        onClose={() => {
          setShowTrainingForm(false)
          setEditingCertificateId(null)
        }}
        title={editingCertificateId ? "Editar Certificado de Capacitación" : "Nuevo Certificado de Capacitación"}
        size="xl"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Selector de Cliente */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cliente <span className="text-red-500">*</span>
            </label>
            {trainingForm.customerName ? (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{trainingForm.customerName}</p>
                    <p className="text-sm text-gray-500">RUC: {trainingForm.customerRuc}</p>
                    {trainingForm.customerAddress && (
                      <p className="text-sm text-gray-500">{trainingForm.customerAddress}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTrainingForm(prev => ({
                      ...prev,
                      customerId: '',
                      customerName: '',
                      customerRuc: '',
                      customerAddress: ''
                    }))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Búsqueda por RUC con lupa */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Buscar por RUC en SUNAT</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ingresa RUC (11 dígitos)"
                      value={rucInput}
                      onChange={(e) => setRucInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      onKeyDown={(e) => e.key === 'Enter' && rucInput.length === 11 && searchRuc('training')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <Button
                      type="button"
                      onClick={() => searchRuc('training')}
                      disabled={isSearchingRuc || rucInput.length !== 11}
                      className="px-3"
                    >
                      {isSearchingRuc ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Separador */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white text-gray-500">o buscar en clientes guardados</span>
                  </div>
                </div>

                {/* Búsqueda en clientes existentes */}
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar por nombre o RUC..."
                        value={customerSearchTerm}
                        onChange={(e) => {
                          setCustomerSearchTerm(e.target.value)
                          setShowCustomerDropdown(true)
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                  </div>

                  {/* Dropdown de clientes */}
                  {showCustomerDropdown && customerSearchTerm && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(customer => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => selectCustomer(customer, 'training')}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          >
                            <p className="font-medium text-gray-900">
                              {customer.businessName || customer.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              RUC/DNI: {customer.documentNumber}
                            </p>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-gray-500 text-center">
                          No se encontraron clientes
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Datos de la Capacitación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Capacitación <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={trainingForm.date}
                onChange={(e) => setTrainingForm(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duración
              </label>
              <select
                value={trainingForm.duration}
                onChange={(e) => setTrainingForm(prev => ({ ...prev, duration: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="30 minutos">30 minutos</option>
                <option value="45 minutos">45 minutos</option>
                <option value="60 minutos">60 minutos</option>
                <option value="90 minutos">90 minutos</option>
                <option value="2 horas">2 horas</option>
                <option value="3 horas">3 horas</option>
                <option value="4 horas">4 horas</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instructor / Capacitador <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={trainingForm.instructor}
              onChange={(e) => setTrainingForm(prev => ({ ...prev, instructor: e.target.value }))}
              placeholder="Ej: Ing. Carlos Pérez Rodríguez"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Título de la capacitación */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título de la Capacitación <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={trainingForm.trainingTitle}
              onChange={(e) => setTrainingForm(prev => ({ ...prev, trainingTitle: e.target.value }))}
              placeholder="Ej: USO Y MANEJO CORRECTO DEL EXTINTOR"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Este texto aparecerá en el certificado como el nombre de la capacitación realizada
            </p>
          </div>

          {/* Temas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temas Cubiertos <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_TRAINING_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => toggleTopic(topic)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    trainingForm.topics.includes(topic)
                      ? 'bg-blue-100 border-blue-500 text-blue-700'
                      : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          {/* Participantes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Participantes <span className="text-red-500">*</span>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addParticipant}
              >
                <UserPlus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Ingresa el DNI y presiona la lupa para buscar el nombre en RENIEC</p>
            <div className="space-y-3">
              {trainingForm.participants.map((participant, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-500">Participante {index + 1}</span>
                    {trainingForm.participants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeParticipant(index)}
                        className="ml-auto text-red-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* DNI con búsqueda */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">DNI</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={participant.dni}
                          onChange={(e) => updateParticipant(index, 'dni', e.target.value.replace(/\D/g, '').slice(0, 8))}
                          onKeyDown={(e) => e.key === 'Enter' && participant.dni.length === 8 && searchDni(index)}
                          placeholder="12345678"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => searchDni(index)}
                          disabled={searchingDniIndex === index || participant.dni.length !== 8}
                          className="px-3"
                        >
                          {searchingDniIndex === index ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {/* Nombre */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nombre completo</label>
                      <input
                        type="text"
                        value={participant.name}
                        onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                        placeholder="Juan Pérez García"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowTrainingForm(false)
                setEditingCertificateId(null)
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveTrainingCertificate}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  {editingCertificateId ? 'Guardar Cambios' : 'Crear Certificado'}
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Formulario Operatividad */}
      <Modal
        isOpen={showOperabilityForm}
        onClose={() => {
          setShowOperabilityForm(false)
          setEditingCertificateId(null)
        }}
        title={editingCertificateId ? "Editar Certificado de Operatividad" : "Nuevo Certificado de Operatividad"}
        size="xl"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Selector de Cliente */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cliente <span className="text-red-500">*</span>
            </label>
            {operabilityForm.customerName ? (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{operabilityForm.customerName}</p>
                    <p className="text-sm text-gray-500">RUC: {operabilityForm.customerRuc}</p>
                    {operabilityForm.customerAddress && (
                      <p className="text-sm text-gray-500">{operabilityForm.customerAddress}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOperabilityForm(prev => ({
                      ...prev,
                      customerId: '',
                      customerName: '',
                      customerRuc: '',
                      customerAddress: ''
                    }))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Búsqueda por RUC con lupa */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Buscar por RUC en SUNAT</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ingresa RUC (11 dígitos)"
                      value={rucInput}
                      onChange={(e) => setRucInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      onKeyDown={(e) => e.key === 'Enter' && rucInput.length === 11 && searchRuc('operability')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <Button
                      type="button"
                      onClick={() => searchRuc('operability')}
                      disabled={isSearchingRuc || rucInput.length !== 11}
                      className="px-3"
                    >
                      {isSearchingRuc ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Separador */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white text-gray-500">o buscar en clientes guardados</span>
                  </div>
                </div>

                {/* Búsqueda en clientes existentes */}
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar por nombre o RUC..."
                        value={customerSearchTerm}
                        onChange={(e) => {
                          setCustomerSearchTerm(e.target.value)
                          setShowCustomerDropdown(true)
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                  </div>

                  {/* Dropdown de clientes */}
                  {showCustomerDropdown && customerSearchTerm && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(customer => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => selectCustomer(customer, 'operability')}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          >
                            <p className="font-medium text-gray-900">
                              {customer.businessName || customer.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              RUC/DNI: {customer.documentNumber}
                            </p>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-gray-500 text-center">
                          No se encontraron clientes
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Datos del Servicio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Servicio <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={operabilityForm.serviceDate}
                onChange={(e) => setOperabilityForm(prev => ({ ...prev, serviceDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Vencimiento
              </label>
              <input
                type="date"
                value={operabilityForm.expirationDate}
                onChange={(e) => setOperabilityForm(prev => ({ ...prev, expirationDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Técnico Responsable <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={operabilityForm.technician}
                onChange={(e) => setOperabilityForm(prev => ({ ...prev, technician: e.target.value }))}
                placeholder="Ej: Téc. Roberto Sánchez"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Período de Garantía
              </label>
              <select
                value={operabilityForm.guaranteePeriod}
                onChange={(e) => setOperabilityForm(prev => ({ ...prev, guaranteePeriod: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="6 meses">6 meses</option>
                <option value="12 meses">12 meses</option>
                <option value="18 meses">18 meses</option>
                <option value="24 meses">24 meses</option>
              </select>
            </div>
          </div>

          {/* Extintores */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Extintores Servidos <span className="text-red-500">*</span>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addExtinguisher}
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar Extintor
              </Button>
            </div>
            <div className="space-y-4">
              {operabilityForm.extinguishers.map((ext, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Extintor #{index + 1}</span>
                    {operabilityForm.extinguishers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExtinguisher(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                      <select
                        value={ext.type}
                        onChange={(e) => updateExtinguisher(index, 'type', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        {EXTINGUISHER_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.value}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Capacidad</label>
                      <select
                        value={ext.capacity}
                        onChange={(e) => updateExtinguisher(index, 'capacity', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        {CAPACITIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Serie/Código *</label>
                      <input
                        type="text"
                        value={ext.serial}
                        onChange={(e) => updateExtinguisher(index, 'serial', e.target.value)}
                        placeholder="EXT-001"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Marca</label>
                      <input
                        type="text"
                        value={ext.brand}
                        onChange={(e) => updateExtinguisher(index, 'brand', e.target.value)}
                        placeholder="Badger, Amerex..."
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ubicación</label>
                      <input
                        type="text"
                        value={ext.location}
                        onChange={(e) => updateExtinguisher(index, 'location', e.target.value)}
                        placeholder="Cocina, Oficina..."
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Servicio</label>
                      <select
                        value={ext.serviceType}
                        onChange={(e) => updateExtinguisher(index, 'serviceType', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="recarga">Recarga</option>
                        <option value="mantenimiento">Mantenimiento</option>
                        <option value="prueba_hidrostatica">Prueba Hidrostática</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fecha Fabricación</label>
                      <input
                        type="date"
                        value={ext.fabricationDate || ''}
                        onChange={(e) => updateExtinguisher(index, 'fabricationDate', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Próx. Prueba Hidrost.</label>
                      <input
                        type="date"
                        value={ext.nextHydrostaticTest || ''}
                        onChange={(e) => updateExtinguisher(index, 'nextHydrostaticTest', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowOperabilityForm(false)
                setEditingCertificateId(null)
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveOperabilityCertificate}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  {editingCertificateId ? 'Guardar Cambios' : 'Crear Certificado'}
                </>
              )}
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
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
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
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Servicio</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Fecha Fab.</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Próx. Prueba</th>
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
                            <td className="px-3 py-2">
                              <Badge variant={ext.serviceType === 'recarga' ? 'info' : 'secondary'}>
                                {ext.serviceType === 'recarga' ? 'Recarga' :
                                 ext.serviceType === 'mantenimiento' ? 'Mantenimiento' :
                                 'Prueba Hidrostática'}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {ext.fabricationDate ? formatDate(new Date(ext.fabricationDate)) : '-'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {ext.nextHydrostaticTest ? formatDate(new Date(ext.nextHydrostaticTest)) : '-'}
                            </td>
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
              <Button
                variant="outline"
                onClick={() => editCertificate(viewingCertificate)}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </Button>
              <Button onClick={() => downloadCertificatePDF(viewingCertificate)}>
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingCertificate}
        onClose={() => setDeletingCertificate(null)}
        title="Eliminar Certificado"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-gray-900 font-medium">
                ¿Estás seguro de eliminar este certificado?
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Se eliminará el certificado <strong>{deletingCertificate?.certificateNumber}</strong> de forma permanente.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeletingCertificate(null)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={deleteCertificate}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
