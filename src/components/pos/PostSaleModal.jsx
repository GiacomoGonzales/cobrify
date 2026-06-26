import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { CheckCircle, Printer, Eye, Share2, Plus, Loader2 } from 'lucide-react'

/**
 * Modal de confirmación post-venta. Muestra las opciones de comprobante (Ticket, Vista
 * previa, PDF, WhatsApp) y "Nueva venta" tras emitir. El envío por WhatsApp pide el número
 * en el momento (campo inline pre-llenado con el del cliente, editable).
 *
 * Toda la lógica (imprimir, PDF, WhatsApp, reset) vive en POS.jsx y llega por props; este
 * componente es solo presentación. El cierre por backdrop deja el carrito bloqueado: POS
 * muestra un mini-aviso para reabrir estas opciones o iniciar una nueva venta.
 */
export default function PostSaleModal({
  isOpen,
  onClose,
  invoice,
  formatCurrency,
  onPrintTicket,
  onPreview,
  onPdf,
  onSendWhatsApp,
  onNewSale,
  isPrintingTicket = false,
  isLoadingPreview = false,
  sendingWhatsApp = false,
  defaultPhone = '',
}) {
  const [showPhone, setShowPhone] = useState(false)
  const [phone, setPhone] = useState('')

  // Resetear el campo de teléfono cada vez que se abre el modal o cambia la venta.
  useEffect(() => {
    if (isOpen) {
      setShowPhone(false)
      setPhone(defaultPhone || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, invoice?.id])

  if (!invoice) return null

  const total = formatCurrency ? formatCurrency(invoice.total, invoice.currency) : invoice.total

  // Primer toque: despliega el campo. Segundo toque (con número): envía.
  const handleWhatsAppClick = () => {
    if (!showPhone) {
      setShowPhone(true)
      setPhone(defaultPhone || '')
      return
    }
    const clean = (phone || '').trim()
    if (!clean) return
    onSendWhatsApp(clean)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Venta completada" size="sm">
      <div className="space-y-4">
        {/* Resumen */}
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-7 h-7 text-green-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-green-900 text-sm truncate">{invoice.number}</p>
            <p className="text-green-700 text-xs">Total: {total}</p>
          </div>
        </div>

        {/* Comprobante */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Comprobante</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={onPrintTicket} disabled={isPrintingTicket}>
              {isPrintingTicket ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <><Printer className="w-4 h-4 mr-1" /><span className="truncate">Ticket</span></>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={onPreview} disabled={isLoadingPreview}>
              {isLoadingPreview ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <><Eye className="w-4 h-4 mr-1" /><span className="truncate">Preview</span></>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={onPdf}>
              <Printer className="w-4 h-4 mr-1" /><span className="truncate">PDF</span>
            </Button>
          </div>
        </div>

        {/* WhatsApp con campo de número en el momento */}
        <div>
          {showPhone && (
            <div className="mb-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Número de WhatsApp</label>
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="Ej: 987654321"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full border-green-500 text-green-700 hover:bg-green-50"
            onClick={handleWhatsAppClick}
            disabled={sendingWhatsApp || (showPhone && !phone.trim())}
          >
            {sendingWhatsApp ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</>
            ) : (
              <><Share2 className="w-4 h-4 mr-2" />{showPhone ? 'Enviar al número' : 'Enviar por WhatsApp'}</>
            )}
          </Button>
        </div>

        {/* Nueva venta */}
        <Button
          onClick={onNewSale}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white h-12"
        >
          <Plus className="w-5 h-5 mr-2" />Nueva venta
        </Button>
      </div>
    </Modal>
  )
}
