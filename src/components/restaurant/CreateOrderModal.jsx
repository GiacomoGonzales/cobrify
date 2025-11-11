import { useState } from 'react'
import { X, ShoppingBag, Bike, Smartphone, User, Phone } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

const ORDER_SOURCES = [
  { value: 'counter', label: 'Mostrador' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'rappi', label: 'Rappi' },
  { value: 'pedidosya', label: 'PedidosYa' },
  { value: 'uber_eats', label: 'Uber Eats' },
  { value: 'glovo', label: 'Glovo' },
  { value: 'web', label: 'Página Web' },
  { value: 'other', label: 'Otro' },
]

export default function CreateOrderModal({ isOpen, onClose, onConfirm }) {
  const [orderType, setOrderType] = useState('takeaway') // 'takeaway' or 'delivery'
  const [source, setSource] = useState('counter')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const handleConfirm = () => {
    const orderData = {
      orderType,
      source: ORDER_SOURCES.find(s => s.value === source)?.label || source,
      customerName: customerName.trim() || null,
      customerPhone: customerPhone.trim() || null,
    }

    onConfirm(orderData)

    // Reset form
    setOrderType('takeaway')
    setSource('counter')
    setCustomerName('')
    setCustomerPhone('')
  }

  const handleClose = () => {
    setOrderType('takeaway')
    setSource('counter')
    setCustomerName('')
    setCustomerPhone('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth="lg">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Nueva Orden</h2>
          <p className="text-sm text-gray-600 mt-1">Configura los detalles de la orden</p>
        </div>
        <button
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Tipo de Orden */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tipo de Orden
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setOrderType('takeaway')}
              className={`p-4 rounded-lg border-2 transition-all ${
                orderType === 'takeaway'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <ShoppingBag className={`w-8 h-8 mx-auto mb-2 ${
                orderType === 'takeaway' ? 'text-green-600' : 'text-gray-400'
              }`} />
              <p className={`font-semibold ${
                orderType === 'takeaway' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Para Llevar
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Cliente recoge en el local
              </p>
            </button>

            <button
              onClick={() => setOrderType('delivery')}
              className={`p-4 rounded-lg border-2 transition-all ${
                orderType === 'delivery'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Bike className={`w-8 h-8 mx-auto mb-2 ${
                orderType === 'delivery' ? 'text-blue-600' : 'text-gray-400'
              }`} />
              <p className={`font-semibold ${
                orderType === 'delivery' ? 'text-blue-700' : 'text-gray-700'
              }`}>
                Delivery
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Entrega a domicilio
              </p>
            </button>
          </div>
        </div>

        {/* Fuente del Pedido */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Fuente del Pedido
            </div>
          </label>
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full"
          >
            {ORDER_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Esta información se usará para reportes
          </p>
        </div>

        {/* Datos del Cliente (Opcional) */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <User className="w-4 h-4" />
            Datos del Cliente (Opcional)
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre
            </label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Teléfono
              </div>
            </label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Ej: 987 654 321"
              type="tel"
              className="w-full"
            />
          </div>
        </div>

        {/* Resumen */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <h4 className="font-semibold text-primary-900 mb-2">Resumen</h4>
          <ul className="text-sm text-primary-800 space-y-1">
            <li>
              • <span className="font-medium">Tipo:</span>{' '}
              {orderType === 'takeaway' ? 'Para Llevar' : 'Delivery'}
            </li>
            <li>
              • <span className="font-medium">Fuente:</span>{' '}
              {ORDER_SOURCES.find(s => s.value === source)?.label}
            </li>
            {customerName && (
              <li>
                • <span className="font-medium">Cliente:</span> {customerName}
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1"
          >
            Continuar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
