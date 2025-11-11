import { useState, useEffect } from 'react'
import { X, Truck, MapPin, User, Package, Calendar, FileText } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'

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
  { value: '7', label: 'Pasaporte' },
]

export default function CreateDispatchGuideModal({ isOpen, onClose, referenceInvoice = null }) {
  const toast = useToast()

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

  // Pre-llenar datos si hay factura de referencia
  useEffect(() => {
    if (referenceInvoice) {
      // Pre-llenar items desde la factura
      const invoiceItems = referenceInvoice.items?.map(item => ({
        code: item.code || item.productId || '',
        description: item.description || item.name || '',
        quantity: item.quantity || 0,
        unit: item.unit || 'NIU',
      })) || []

      setItems(invoiceItems)

      // Calcular peso estimado (ejemplo: 1kg por producto)
      const estimatedWeight = invoiceItems.reduce((sum, item) => sum + (item.quantity * 1), 0)
      setTotalWeight(estimatedWeight.toString())

      // Pre-llenar fecha de traslado (mañana por defecto)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setTransferDate(tomorrow.toISOString().split('T')[0])

      // Motivo: Venta (si viene de factura)
      setTransferReason('01')
    }
  }, [referenceInvoice])

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

    // Validar datos según modalidad de transporte
    if (transportMode === '02') {
      // Transporte privado
      if (!driverDocNumber || !driverName || !driverLastName || !driverLicense || !vehiclePlate) {
        toast.error('Debe completar todos los datos del conductor y vehículo para transporte privado')
        return
      }
    } else {
      // Transporte público
      if (!carrierRuc || !carrierName) {
        toast.error('Debe completar los datos del transportista para transporte público')
        return
      }
    }

    if (items.length === 0) {
      toast.error('Debe agregar al menos un producto a transportar')
      return
    }

    setIsSaving(true)

    try {
      const dispatchGuide = {
        // Documento de referencia (si viene de factura)
        referencedInvoice: referenceInvoice ? {
          documentType: referenceInvoice.documentType === 'factura' ? '01' : '03',
          series: referenceInvoice.number?.split('-')[0] || '',
          number: referenceInvoice.number?.split('-')[1] || '',
        } : null,

        // Datos básicos
        transferReason,
        transportMode,
        transferDate,
        totalWeight: parseFloat(totalWeight),

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

        // Metadatos
        createdAt: new Date(),
        status: 'draft', // Estado inicial
      }

      console.log('📦 Guía de remisión a guardar:', dispatchGuide)

      // TODO: Guardar en Firestore y generar XML
      toast.success('Funcionalidad en desarrollo - Datos capturados correctamente')

      // Cerrar modal
      onClose()

    } catch (error) {
      console.error('Error al crear guía de remisión:', error)
      toast.error('Error al crear la guía de remisión')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="6xl">
      <div className="flex items-center justify-between mb-6 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Truck className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Generar Guía de Remisión Electrónica
            </h2>
            {referenceInvoice && (
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  Referencia: {referenceInvoice.number} - {referenceInvoice.customer?.name}
                </p>
                {referenceInvoice.createdAt && (
                  <p className="text-xs text-gray-500">
                    Factura emitida: {new Date(referenceInvoice.createdAt.toDate ? referenceInvoice.createdAt.toDate() : referenceInvoice.createdAt).toLocaleDateString('es-PE')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 custom-scrollbar">
        {/* Info sobre fechas válidas */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-800">
              <p className="font-medium">Nota importante sobre fechas:</p>
              <p className="mt-1">
                • La guía se puede generar para facturas de <strong>cualquier fecha</strong><br/>
                • La fecha de inicio del traslado debe ser <strong>hoy o en el futuro</strong><br/>
                • Según SUNAT: La guía puede emitirse hasta <strong>5 días antes</strong> del traslado
              </p>
            </div>
          </div>
        </div>

        {/* Datos Básicos */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
          <div className="flex items-start gap-2">
            <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-900 text-sm">Datos Básicos del Traslado</h3>
              <p className="text-xs text-blue-800 mt-1">
                Información general sobre el motivo y modalidad del transporte
              </p>
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

          <div>
            <Input
              type="date"
              label="Fecha de Inicio del Traslado"
              icon={Calendar}
              required
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              helperText="Debe ser hoy o fecha futura"
            />
            <p className="text-xs text-blue-600 mt-1">
              ℹ️ La guía se puede emitir hasta 5 días antes del traslado
            </p>
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
        </div>

        {/* Origen */}
        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg">
          <div className="flex items-start gap-2">
            <MapPin className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-orange-900 text-sm">Punto de Partida (Origen)</h3>
              <p className="text-xs text-orange-800 mt-1">
                Dirección desde donde se inicia el traslado
              </p>
            </div>
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
            <div>
              <h3 className="font-semibold text-green-900 text-sm">Punto de Llegada (Destino)</h3>
              <p className="text-xs text-green-800 mt-1">
                Dirección donde finalizará el traslado
              </p>
            </div>
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

        {/* Datos de Transporte */}
        <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg">
          <div className="flex items-start gap-2">
            <User className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-purple-900 text-sm">
                Datos de Transporte {transportMode === '02' ? '(Privado)' : '(Público)'}
              </h3>
              <p className="text-xs text-purple-800 mt-1">
                {transportMode === '02'
                  ? 'Información del conductor y vehículo propio'
                  : 'Información de la empresa transportista'}
              </p>
            </div>
          </div>
        </div>

        {transportMode === '02' ? (
          // Transporte Privado
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Select
                label="Tipo de Documento"
                required
                value={driverDocType}
                onChange={(e) => setDriverDocType(e.target.value)}
              >
                {DOCUMENT_TYPES.map(type => (
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
          // Transporte Público
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
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Bienes a Transportar</h3>
              <p className="text-xs text-gray-700 mt-1">
                {items.length} producto(s) - {referenceInvoice ? 'Pre-llenado desde factura' : 'Agregue los productos'}
              </p>
            </div>
          </div>
        </div>

        {items.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Descripción
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cantidad
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Unidad
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.code || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Botones */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 mt-6 border-t-2 border-gray-200 sticky bottom-0 bg-white -mx-2 px-2 pb-2">
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
                Generando Guía...
              </>
            ) : (
              <>
                <Truck className="w-5 h-5 mr-2" />
                Generar Guía de Remisión
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
