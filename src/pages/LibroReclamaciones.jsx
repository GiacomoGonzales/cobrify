import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  BookOpen,
  AlertCircle,
  CheckCircle,
  Loader2,
  Search,
  FileText,
  Download,
  Clock,
  Calendar,
  User,
  Phone,
  Mail,
  MapPin,
  FileQuestion,
  ChevronRight,
  ArrowLeft,
  Building2
} from 'lucide-react'
import {
  getBusinessByComplaintsSlug,
  createPublicComplaint,
  getComplaintByTrackingCode,
  COMPLAINT_TYPES,
  DOCUMENT_TYPES,
  COMPLAINT_STATUS,
  getDaysRemaining
} from '@/services/complaintService'
import { generateComplaintPDF } from '@/utils/complaintPdfGenerator'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

// Schema de validación para el formulario de reclamo
const complaintSchema = z.object({
  type: z.enum(['reclamo', 'queja'], { required_error: 'Seleccione el tipo' }),
  consumer: z.object({
    fullName: z.string().min(3, 'Nombre debe tener al menos 3 caracteres'),
    documentType: z.string().min(1, 'Seleccione tipo de documento'),
    documentNumber: z.string().min(8, 'Documento inválido'),
    email: z.string().email('Email inválido'),
    phone: z.string().optional(),
    address: z.string().optional()
  }),
  isMinor: z.boolean().default(false),
  guardian: z.object({
    fullName: z.string().optional(),
    documentType: z.string().optional(),
    documentNumber: z.string().optional()
  }).optional(),
  productOrService: z.string().min(3, 'Ingrese el producto o servicio'),
  amount: z.string().optional(),
  description: z.string().min(20, 'Descripción debe tener al menos 20 caracteres'),
  consumerRequest: z.string().min(10, 'Ingrese su pedido o solicitud'),
  acceptTerms: z.boolean().refine(val => val === true, 'Debe aceptar los términos')
}).refine(data => {
  if (data.isMinor) {
    return data.guardian?.fullName && data.guardian?.documentNumber
  }
  return true
}, {
  message: 'Complete los datos del padre/apoderado',
  path: ['guardian']
})

export default function LibroReclamaciones() {
  const { slug } = useParams()
  const [business, setBusiness] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('menu') // 'menu' | 'form' | 'lookup' | 'success' | 'result'
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedComplaint, setSubmittedComplaint] = useState(null)
  const [lookupCode, setLookupCode] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupError, setLookupError] = useState(null)
  const [isLookingUp, setIsLookingUp] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset
  } = useForm({
    resolver: zodResolver(complaintSchema),
    defaultValues: {
      type: 'reclamo',
      consumer: {
        documentType: 'DNI'
      },
      isMinor: false,
      guardian: {
        documentType: 'DNI'
      },
      acceptTerms: false
    }
  })

  const isMinor = watch('isMinor')
  const complaintType = watch('type')

  // Cargar datos del negocio
  useEffect(() => {
    const loadBusiness = async () => {
      if (!slug) {
        setError('URL inválida')
        setIsLoading(false)
        return
      }

      try {
        const businessData = await getBusinessByComplaintsSlug(slug)
        if (businessData) {
          setBusiness(businessData)
        } else {
          setError('Libro de Reclamaciones no encontrado o no habilitado')
        }
      } catch (err) {
        console.error('Error loading business:', err)
        setError('Error al cargar la información')
      } finally {
        setIsLoading(false)
      }
    }

    loadBusiness()
  }, [slug])

  // Enviar reclamo
  const onSubmit = async (data) => {
    if (!business) return

    setIsSubmitting(true)
    try {
      const complaint = await createPublicComplaint(business.id, data, business)
      setSubmittedComplaint(complaint)
      setView('success')
      reset()
    } catch (err) {
      console.error('Error submitting complaint:', err)
      alert('Error al enviar el reclamo. Por favor intente nuevamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Consultar reclamo por código
  const handleLookup = async () => {
    if (!lookupCode.trim()) {
      setLookupError('Ingrese el código de seguimiento')
      return
    }

    setIsLookingUp(true)
    setLookupError(null)
    setLookupResult(null)

    try {
      const result = await getComplaintByTrackingCode(slug, lookupCode.trim())
      if (result.success) {
        setLookupResult(result.complaint)
        setView('result')
      } else {
        setLookupError(result.error || 'Reclamo no encontrado')
      }
    } catch (err) {
      setLookupError('Error al consultar el reclamo')
    } finally {
      setIsLookingUp(false)
    }
  }

  // Descargar PDF
  const handleDownloadPDF = async (complaint) => {
    try {
      await generateComplaintPDF(complaint, business)
    } catch (err) {
      console.error('Error generating PDF:', err)
      alert('Error al generar el PDF')
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">No disponible</h2>
            <p className="text-gray-600">{error}</p>
            <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">
              Volver al inicio
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-red-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Libro de Reclamaciones</h1>
              <p className="text-sm text-gray-600">{business?.businessName}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Menu inicial */}
        {view === 'menu' && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center mb-6">
                  <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h2 className="text-lg font-semibold text-gray-800">{business?.businessName}</h2>
                  {business?.ruc && <p className="text-sm text-gray-500">RUC: {business.ruc}</p>}
                  {business?.address && <p className="text-sm text-gray-500">{business.address}</p>}
                </div>

                <div className="border-t pt-6 space-y-4">
                  <button
                    onClick={() => setView('form')}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-800">Registrar Reclamo o Queja</p>
                        <p className="text-sm text-gray-500">Complete el formulario para presentar su reclamo</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <button
                    onClick={() => setView('lookup')}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Search className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-800">Consultar Estado</p>
                        <p className="text-sm text-gray-500">Revise el estado de su reclamo con su código</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </CardContent>
            </Card>

            <div className="text-center text-sm text-gray-500">
              <p>Conforme a la Ley N° 29571 - Código de Protección y Defensa del Consumidor</p>
              <p>y el D.S. N° 011-2011-PCM</p>
            </div>
          </div>
        )}

        {/* Formulario de reclamo */}
        {view === 'form' && (
          <div className="space-y-6">
            <button
              onClick={() => setView('menu')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Tipo de reclamo */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileQuestion className="w-5 h-5" />
                    1. Tipo de Reclamo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {COMPLAINT_TYPES.map(type => (
                      <label
                        key={type.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          complaintType === type.id
                            ? 'border-red-500 bg-red-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          {...register('type')}
                          value={type.id}
                          className="mt-1"
                        />
                        <div>
                          <p className="font-medium text-gray-800">{type.name}</p>
                          <p className="text-sm text-gray-500">{type.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {errors.type && (
                    <p className="text-red-500 text-sm mt-2">{errors.type.message}</p>
                  )}
                </CardContent>
              </Card>

              {/* Datos del consumidor */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5" />
                    2. Datos del Consumidor
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre Completo *
                    </label>
                    <Input
                      {...register('consumer.fullName')}
                      placeholder="Juan Pérez García"
                      error={errors.consumer?.fullName?.message}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tipo de Documento *
                      </label>
                      <Select {...register('consumer.documentType')}>
                        {DOCUMENT_TYPES.map(doc => (
                          <option key={doc.id} value={doc.id}>{doc.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Número de Documento *
                      </label>
                      <Input
                        {...register('consumer.documentNumber')}
                        placeholder="12345678"
                        error={errors.consumer?.documentNumber?.message}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Correo Electrónico *
                    </label>
                    <Input
                      type="email"
                      {...register('consumer.email')}
                      placeholder="correo@ejemplo.com"
                      error={errors.consumer?.email?.message}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono
                      </label>
                      <Input
                        {...register('consumer.phone')}
                        placeholder="987654321"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Dirección
                      </label>
                      <Input
                        {...register('consumer.address')}
                        placeholder="Av. Principal 123"
                      />
                    </div>
                  </div>

                  {/* Menor de edad */}
                  <div className="border-t pt-4 mt-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        {...register('isMinor')}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">El consumidor es menor de edad</span>
                    </label>

                    {isMinor && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                        <p className="text-sm font-medium text-gray-700">Datos del Padre/Madre/Apoderado</p>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Nombre Completo *</label>
                          <Input
                            {...register('guardian.fullName')}
                            placeholder="Nombre del apoderado"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Tipo Doc.</label>
                            <Select {...register('guardian.documentType')}>
                              {DOCUMENT_TYPES.map(doc => (
                                <option key={doc.id} value={doc.id}>{doc.name}</option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">N° Documento *</label>
                            <Input
                              {...register('guardian.documentNumber')}
                              placeholder="12345678"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Detalle del reclamo */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    3. Detalle del Reclamo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Producto o Servicio *
                      </label>
                      <Input
                        {...register('productOrService')}
                        placeholder="Ej: Servicio de delivery, Producto electrónico"
                        error={errors.productOrService?.message}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Monto Reclamado (S/)
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register('amount')}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descripción del Reclamo *
                    </label>
                    <textarea
                      {...register('description')}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="Describa detalladamente los hechos que motivan su reclamo..."
                    />
                    {errors.description && (
                      <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pedido del Consumidor *
                    </label>
                    <textarea
                      {...register('consumerRequest')}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="Indique qué solución espera recibir (devolución, cambio, reparación, etc.)"
                    />
                    {errors.consumerRequest && (
                      <p className="text-red-500 text-sm mt-1">{errors.consumerRequest.message}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Confirmación */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">4. Confirmación</CardTitle>
                </CardHeader>
                <CardContent>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      {...register('acceptTerms')}
                      className="mt-1 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-600">
                      Declaro que la información proporcionada es verdadera y acepto que mi reclamo
                      sea procesado conforme a lo establecido en el Código de Protección y Defensa
                      del Consumidor (Ley N° 29571).
                    </span>
                  </label>
                  {errors.acceptTerms && (
                    <p className="text-red-500 text-sm mt-2">{errors.acceptTerms.message}</p>
                  )}
                </CardContent>
              </Card>

              <Button
                type="submit"
                className="w-full"
                variant="danger"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Enviar Reclamo
                  </>
                )}
              </Button>
            </form>
          </div>
        )}

        {/* Vista de éxito */}
        {view === 'success' && submittedComplaint && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  Reclamo Registrado
                </h2>
                <p className="text-gray-600 mb-6">
                  Su reclamo ha sido registrado exitosamente
                </p>

                <div className="bg-gray-50 rounded-lg p-6 max-w-md mx-auto text-left space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">N° de Reclamo:</span>
                    <span className="font-mono font-bold">{submittedComplaint.complaintNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Código de Seguimiento:</span>
                    <span className="font-mono font-bold text-blue-600">{submittedComplaint.trackingCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Fecha Límite de Respuesta:</span>
                    <span className="font-medium">
                      {new Date(submittedComplaint.dueDate).toLocaleDateString('es-PE')}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-500 mt-4">
                  Guarde su código de seguimiento para consultar el estado de su reclamo
                </p>

                <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center">
                  <Button
                    onClick={() => handleDownloadPDF(submittedComplaint)}
                    variant="outline"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Constancia
                  </Button>
                  <Button
                    onClick={() => {
                      setSubmittedComplaint(null)
                      setView('menu')
                    }}
                  >
                    Volver al Inicio
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Vista de consulta */}
        {view === 'lookup' && (
          <div className="space-y-6">
            <button
              onClick={() => setView('menu')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Consultar Estado del Reclamo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Ingrese su código de seguimiento para verificar el estado de su reclamo
                </p>

                <div className="flex gap-3">
                  <Input
                    value={lookupCode}
                    onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                    placeholder="Ej: ABC12XY9"
                    className="font-mono uppercase"
                    maxLength={8}
                  />
                  <Button
                    onClick={handleLookup}
                    disabled={isLookingUp}
                  >
                    {isLookingUp ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {lookupError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    {lookupError}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Resultado de consulta */}
        {view === 'result' && lookupResult && (
          <div className="space-y-6">
            <button
              onClick={() => {
                setLookupResult(null)
                setView('lookup')
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Detalle del Reclamo</CardTitle>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    lookupResult.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    lookupResult.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {COMPLAINT_STATUS[lookupResult.status]?.name || lookupResult.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Información básica */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">N° de Reclamo</p>
                    <p className="font-mono font-bold">{lookupResult.complaintNumber}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Código de Seguimiento</p>
                    <p className="font-mono font-bold text-blue-600">{lookupResult.trackingCode}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Fecha de Registro</p>
                    <p className="font-medium">
                      {new Date(lookupResult.createdAt).toLocaleDateString('es-PE')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tipo</p>
                    <p className="font-medium capitalize">{lookupResult.type}</p>
                  </div>
                </div>

                {/* Días restantes */}
                {lookupResult.status === 'pending' && (
                  <div className={`p-4 rounded-lg ${
                    getDaysRemaining(lookupResult.dueDate) < 0 ? 'bg-red-50 border border-red-200' :
                    getDaysRemaining(lookupResult.dueDate) <= 5 ? 'bg-yellow-50 border border-yellow-200' :
                    'bg-blue-50 border border-blue-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      <span className="font-medium">
                        {getDaysRemaining(lookupResult.dueDate) < 0 ? (
                          <span className="text-red-700">Plazo vencido hace {Math.abs(getDaysRemaining(lookupResult.dueDate))} días</span>
                        ) : getDaysRemaining(lookupResult.dueDate) === 0 ? (
                          <span className="text-yellow-700">El plazo vence hoy</span>
                        ) : (
                          <span className={getDaysRemaining(lookupResult.dueDate) <= 5 ? 'text-yellow-700' : 'text-blue-700'}>
                            {getDaysRemaining(lookupResult.dueDate)} días restantes para la respuesta
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Fecha límite: {new Date(lookupResult.dueDate).toLocaleDateString('es-PE')}
                    </p>
                  </div>
                )}

                {/* Detalle */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-800 mb-2">Detalle del Reclamo</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-500">Producto/Servicio:</span> {lookupResult.productOrService}</p>
                    {lookupResult.amount && (
                      <p><span className="text-gray-500">Monto:</span> S/ {parseFloat(lookupResult.amount).toFixed(2)}</p>
                    )}
                    <p><span className="text-gray-500">Descripción:</span></p>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">{lookupResult.description}</p>
                    <p><span className="text-gray-500">Pedido:</span></p>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">{lookupResult.consumerRequest}</p>
                  </div>
                </div>

                {/* Respuesta del proveedor */}
                {lookupResult.response && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-800 mb-2">Respuesta del Proveedor</h4>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-gray-700">{lookupResult.response.text}</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Respondido el: {new Date(lookupResult.response.respondedAt).toLocaleDateString('es-PE')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <Button
                    onClick={() => handleDownloadPDF(lookupResult)}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Constancia PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
