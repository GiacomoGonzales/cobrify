import { useState, useEffect } from 'react'
import { X, Truck, MapPin, User, Package, Calendar, FileText, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { useAppContext } from '@/hooks/useAppContext'
import { updateDispatchGuide } from '@/services/firestoreService'

const TRANSFER_REASONS = [
  { value: '01', label: '01 - Venta' },
  { value: '02', label: '02 - Compra' },
  { value: '04', label: '04 - Traslado entre establecimientos de la misma empresa' },
  { value: '08', label: '08 - Importación' },
  { value: '09', label: '09 - Exportación' },
  { value: '13', label: '13 - Otros' },
]

const TRANSPORT_MODES = [
  { value: '01', label: '01 - Transporte Público' },
  { value: '02', label: '02 - Transporte Privado' },
]

const DOCUMENT_TYPES = [
  { value: '1', label: 'DNI' },
  { value: '4', label: 'Carnet de Extranjería' },
  { value: '6', label: 'RUC' },
  { value: '7', label: 'Pasaporte' },
]

export default function EditDispatchGuideModal({ isOpen, onClose, guide, onUpdated }) {
  const toast = useToast()
  const { getBusinessId } = useAppContext()

  // Datos básicos de la guía
  const [transferReason, setTransferReason] = useState('01')
  const [transportMode, setTransportMode] = useState('02')
  const [transferDate, setTransferDate] = useState('')
  const [totalWeight, setTotalWeight] = useState('')

  // Origen
  const [originAddress, setOriginAddress] = useState('')
  const [originUbigeo, setOriginUbigeo] = useState('')

  // Destino
  const [destinationAddress, setDestinationAddress] = useState('')
  const [destinationUbigeo, setDestinationUbigeo] = useState('')

  // Destinatario
  const [recipientDocType, setRecipientDocType] = useState('6')
  const [recipientDocNumber, setRecipientDocNumber] = useState('')
  const [recipientName, setRecipientName] = useState('')

  // Datos de transporte privado
  const [driverDocType, setDriverDocType] = useState('1')
  const [driverDocNumber, setDriverDocNumber] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverLastName, setDriverLastName] = useState('')
  const [driverLicense, setDriverLicense] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')

  // Datos de transporte público
  const [carrierRuc, setCarrierRuc] = useState('')
  const [carrierName, setCarrierName] = useState('')

  // Items (productos)
  const [items, setItems] = useState([])

  const [isSaving, setIsSaving] = useState(false)

  // Cargar datos de la guía cuando se abre el modal o resetear cuando se cierra
  useEffect(() => {
    if (!isOpen) {
      // Resetear estados cuando se cierra el modal
      setTransferReason('01')
      setTransportMode('02')
      setTransferDate('')
      setTotalWeight('')
      setOriginAddress('')
      setOriginUbigeo('')
      setDestinationAddress('')
      setDestinationUbigeo('')
      setRecipientDocType('6')
      setRecipientDocNumber('')
      setRecipientName('')
      setDriverDocType('1')
      setDriverDocNumber('')
      setDriverName('')
      setDriverLastName('')
      setDriverLicense('')
      setVehiclePlate('')
      setCarrierRuc('')
      setCarrierName('')
      setItems([])
      return
    }

    // Si está abierto y hay guía, cargar los datos
    if (guide) {
      console.log('📝 Cargando datos de guía para edición:', JSON.stringify(guide, null, 2))

      // Datos básicos
      setTransferReason(guide.transferReason || '01')
      setTransportMode(guide.transportMode || '02')
      setTotalWeight(guide.totalWeight?.toString() || '')

      // Fecha de traslado - manejar diferentes formatos
      if (guide.transferDate) {
        let dateStr = ''
        if (typeof guide.transferDate === 'string') {
          // Si es string ISO o solo fecha, extraer YYYY-MM-DD
          dateStr = guide.transferDate.split('T')[0]
        } else if (guide.transferDate.toDate) {
          // Si es Timestamp de Firestore
          dateStr = guide.transferDate.toDate().toISOString().split('T')[0]
        } else if (guide.transferDate instanceof Date) {
          // Si es Date nativo
          dateStr = guide.transferDate.toISOString().split('T')[0]
        }
        setTransferDate(dateStr)
        console.log('📅 Fecha cargada:', dateStr)
      } else {
        setTransferDate('')
      }

      // Origen
      setOriginAddress(guide.origin?.address || '')
      setOriginUbigeo(guide.origin?.ubigeo || '')
      console.log('📍 Origen:', guide.origin)

      // Destino
      setDestinationAddress(guide.destination?.address || '')
      setDestinationUbigeo(guide.destination?.ubigeo || '')
      console.log('📍 Destino:', guide.destination)

      // Destinatario - buscar en varios lugares posibles
      const recipient = guide.recipient || guide.customer || {}
      let docType = recipient.documentType || '6'
      // Normalizar tipo de documento
      if (docType === 'RUC') docType = '6'
      else if (docType === 'DNI') docType = '1'
      setRecipientDocType(docType)
      setRecipientDocNumber(recipient.documentNumber || '')
      setRecipientName(recipient.name || recipient.businessName || '')
      console.log('👤 Destinatario:', recipient)

      // Transporte privado - buscar en transport.driver o driver directamente
      const driver = guide.transport?.driver || guide.driver || {}
      let driverDocT = driver.documentType || '1'
      if (driverDocT === 'DNI') driverDocT = '1'
      setDriverDocType(driverDocT)
      setDriverDocNumber(driver.documentNumber || '')
      setDriverName(driver.name || driver.names || '')
      setDriverLastName(driver.lastName || driver.lastNames || '')
      setDriverLicense(driver.license || '')
      console.log('🚗 Conductor:', driver)

      // Vehículo - buscar en transport.vehicle o vehicle directamente
      const vehicle = guide.transport?.vehicle || guide.vehicle || {}
      setVehiclePlate(vehicle.plate || '')
      console.log('🚛 Vehículo:', vehicle)

      // Transporte público - buscar en transport.carrier o carrier directamente
      const carrier = guide.transport?.carrier || guide.carrier || {}
      setCarrierRuc(carrier.ruc || '')
      setCarrierName(carrier.businessName || carrier.name || '')
      console.log('🚚 Transportista:', carrier)

      // Items
      setItems(guide.items || [])
      console.log('📦 Items:', guide.items)
    }
  }, [guide, isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validaciones básicas
    if (!transferDate) {
      toast.error('Debe ingresar la fecha de inicio del traslado')
      return
    }

    if (!originAddress || !originUbigeo) {
      toast.error('Debe completar la dirección de origen')
      return
    }

    if (!destinationAddress || !destinationUbigeo) {
      toast.error('Debe completar la dirección de destino')
      return
    }

    if (!totalWeight || parseFloat(totalWeight) <= 0) {
      toast.error('Debe ingresar el peso total de la mercancía')
      return
    }

    // Validar destinatario
    if (!recipientDocNumber || !recipientName) {
      toast.error('Debe completar los datos del destinatario')
      return
    }

    // Validar datos según modalidad de transporte
    if (transportMode === '02') {
      if (!driverDocNumber || !driverName || !driverLastName || !driverLicense || !vehiclePlate) {
        toast.error('Debe completar todos los datos del conductor y vehículo para transporte privado')
        return
      }
    } else {
      if (!carrierRuc || !carrierName) {
        toast.error('Debe completar los datos del transportista para transporte público')
        return
      }
    }

    if (items.length === 0) {
      toast.error('Debe tener al menos un producto a transportar')
      return
    }

    setIsSaving(true)

    try {
      const businessId = getBusinessId()

      const updates = {
        // Datos básicos
        transferReason,
        transportMode,
        transferDate,
        totalWeight: parseFloat(totalWeight),

        // Destinatario
        recipient: {
          documentType: recipientDocType,
          documentNumber: recipientDocNumber,
          name: recipientName,
        },

        // Origen y destino
        origin: {
          address: originAddress,
          ubigeo: originUbigeo,
        },
        destination: {
          address: destinationAddress,
          ubigeo: destinationUbigeo,
        },

        // Datos de transporte
        transport: transportMode === '02' ? {
          driver: {
            documentType: driverDocType,
            documentNumber: driverDocNumber,
            name: driverName,
            lastName: driverLastName,
            license: driverLicense,
          },
          vehicle: {
            plate: vehiclePlate,
          },
        } : {
          carrier: {
            ruc: carrierRuc,
            businessName: carrierName,
          },
        },

        // Items
        items,
      }

      const result = await updateDispatchGuide(businessId, guide.id, updates)

      if (result.success) {
        toast.success('Guía de remisión actualizada correctamente')
        onUpdated?.()
        onClose()
      } else {
        throw new Error(result.error || 'Error al actualizar la guía')
      }

    } catch (error) {
      console.error('Error al actualizar guía de remisión:', error)
      toast.error(error.message || 'Error al actualizar la guía de remisión')
    } finally {
      setIsSaving(false)
    }
  }

  // Verificar si la guía ya fue enviada a SUNAT
  const isAlreadySent = guide?.sunatStatus === 'accepted' || guide?.sunatStatus === 'rejected'

  if (!guide) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="6xl">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Truck className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Editar Guía de Remisión
            </h2>
            <p className="text-sm text-gray-600">
              {guide.number}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Alerta si ya fue enviada */}
      {isAlreadySent && (
        <div className="mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-yellow-800">Guía ya procesada por SUNAT</h4>
              <p className="text-sm text-yellow-700 mt-1">
                Esta guía ya fue enviada a SUNAT y no puede ser modificada. Los cambios que realice
                solo se guardarán localmente para referencia.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[calc(90vh-8rem)]">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* Datos Básicos */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-900 text-sm">Datos Básicos del Traslado</h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              label="Motivo de Traslado"
              required
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
            >
              {TRANSFER_REASONS.map(reason => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </Select>

            <Select
              label="Modalidad de Transporte"
              required
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value)}
            >
              {TRANSPORT_MODES.map(mode => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </Select>

            <Input
              type="date"
              label="Fecha de Inicio del Traslado"
              required
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />

            <Input
              type="number"
              label="Peso Total (kg)"
              placeholder="Ej: 25.5"
              required
              value={totalWeight}
              onChange={(e) => setTotalWeight(e.target.value)}
              step="0.01"
              min="0.01"
            />
          </div>

          {/* Origen */}
          <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <h3 className="font-semibold text-orange-900 text-sm">Punto de Partida (Origen)</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Dirección de Origen"
              placeholder="Av. Principal 123, Lima"
              required
              value={originAddress}
              onChange={(e) => setOriginAddress(e.target.value)}
            />
            <Input
              label="Ubigeo de Origen"
              placeholder="150101"
              required
              value={originUbigeo}
              onChange={(e) => setOriginUbigeo(e.target.value)}
              maxLength={6}
              helperText="6 dígitos (consultar en SUNAT)"
            />
          </div>

          {/* Destino */}
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <h3 className="font-semibold text-green-900 text-sm">Punto de Llegada (Destino)</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Dirección de Destino"
              placeholder="Jr. Comercio 456, Callao"
              required
              value={destinationAddress}
              onChange={(e) => setDestinationAddress(e.target.value)}
            />
            <Input
              label="Ubigeo de Destino"
              placeholder="070101"
              required
              value={destinationUbigeo}
              onChange={(e) => setDestinationUbigeo(e.target.value)}
              maxLength={6}
              helperText="6 dígitos (consultar en SUNAT)"
            />
          </div>

          {/* Destinatario */}
          <div className="bg-teal-50 border-l-4 border-teal-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <User className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <h3 className="font-semibold text-teal-900 text-sm">Datos del Destinatario</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Tipo de Documento"
              required
              value={recipientDocType}
              onChange={(e) => setRecipientDocType(e.target.value)}
            >
              <option value="6">RUC</option>
              <option value="1">DNI</option>
              <option value="4">Carnet de Extranjería</option>
              <option value="7">Pasaporte</option>
            </Select>

            <Input
              label="Número de Documento"
              placeholder={recipientDocType === '6' ? '20123456789' : '12345678'}
              required
              value={recipientDocNumber}
              onChange={(e) => setRecipientDocNumber(e.target.value)}
              maxLength={recipientDocType === '6' ? 11 : 15}
            />

            <Input
              label="Nombre / Razón Social"
              placeholder="Nombre del destinatario"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>

          {/* Datos de Transporte */}
          <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Truck className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <h3 className="font-semibold text-purple-900 text-sm">
                Datos de Transporte {transportMode === '02' ? '(Privado)' : '(Público)'}
              </h3>
            </div>
          </div>

          {transportMode === '02' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Select
                  label="Tipo de Documento"
                  required
                  value={driverDocType}
                  onChange={(e) => setDriverDocType(e.target.value)}
                >
                  {DOCUMENT_TYPES.filter(t => t.value !== '6').map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>

                <Input
                  label="Número de Documento"
                  placeholder="12345678"
                  required
                  value={driverDocNumber}
                  onChange={(e) => setDriverDocNumber(e.target.value)}
                />

                <Input
                  label="Licencia de Conducir"
                  placeholder="Q12345678"
                  required
                  value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input
                  label="Nombres del Conductor"
                  placeholder="Juan"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                />

                <Input
                  label="Apellidos del Conductor"
                  placeholder="Pérez García"
                  required
                  value={driverLastName}
                  onChange={(e) => setDriverLastName(e.target.value)}
                />

                <Input
                  label="Placa del Vehículo"
                  placeholder="ABC-123"
                  required
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="RUC del Transportista"
                placeholder="20123456789"
                required
                value={carrierRuc}
                onChange={(e) => setCarrierRuc(e.target.value)}
                maxLength={11}
              />

              <Input
                label="Razón Social del Transportista"
                placeholder="TRANSPORTES SAC"
                required
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
              />
            </div>
          )}

          {/* Items */}
          <div className="bg-gray-50 border-l-4 border-gray-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Package className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <h3 className="font-semibold text-gray-900 text-sm">
                Bienes a Transportar ({items.length} productos)
              </h3>
            </div>
          </div>

          {items.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidad</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.code || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.description || item.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.unit || 'NIU'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-lg">
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto"
              size="lg"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Guardando...
                </>
              ) : (
                <>
                  <Truck className="w-5 h-5 mr-2" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
