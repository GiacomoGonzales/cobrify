import { useState, useEffect } from 'react'
import { AlertTriangle, MessageCircle, Copy, Check, Smartphone, Building2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { getVendedor } from '@/services/vendedorService'

const DEFAULT_WHATSAPP = '51900434988'

const DEFAULT_PAYMENT_INFO = {
  yape: { number: '926 258 059', name: 'Quantio Solutions EIRL' },
  bcp: { account: '1937311451039', cci: '00219300731145103916' },
  titular: 'Quantio Solutions EIRL',
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
      title="Copiar"
    >
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-gray-500" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

export default function SubscriptionBlockedModal({ isOpen, subscription, businessName }) {
  const email = subscription?.email || ''
  const [vendedor, setVendedor] = useState(null)

  useEffect(() => {
    if (subscription?.vendedorId) {
      getVendedor(subscription.vendedorId).then(result => {
        if (result.success) setVendedor(result.data)
      })
    }
  }, [subscription?.vendedorId])

  const paymentInfo = vendedor
    ? {
        yape: { number: vendedor.yapeNumber, name: vendedor.yapeName },
        bcp: { account: vendedor.bcpAccount, cci: vendedor.bcpCci },
        titular: vendedor.titular,
      }
    : DEFAULT_PAYMENT_INFO

  const whatsappNumber = vendedor?.phone || DEFAULT_WHATSAPP
  const yapeRaw = vendedor ? vendedor.yapeNumber.replace(/\s/g, '') : '926258059'

  const handleContactWhatsApp = () => {
    const message = encodeURIComponent(
      `Hola, quiero renovar mi suscripción de Cobrify. Mi email es ${email}. Mi negocio es ${businessName || ''}.`
    )
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      title=""
      size="md"
    >
      <div className="py-4 px-2">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 mb-3">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Tu suscripción ha vencido</h3>
          <p className="text-sm text-gray-600 mt-2">
            Realiza el pago a las siguientes cuentas y envía la captura al WhatsApp para reactivar tu cuenta.
          </p>
        </div>

        {/* Datos de pago */}
        <div className="mb-5 space-y-3">
          {/* Yape */}
          {paymentInfo.yape.number && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-800">Yape</span>
                </div>
                <CopyButton text={yapeRaw} />
              </div>
              <p className="text-purple-900 font-mono font-medium mt-1">{paymentInfo.yape.number}</p>
              <p className="text-xs text-purple-600">{paymentInfo.yape.name}</p>
            </div>
          )}

          {/* Cuenta BCP */}
          {paymentInfo.bcp.account && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">Cuenta BCP Soles</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-blue-500 uppercase">N. Cuenta</p>
                    <p className="text-sm font-mono font-medium text-blue-900">{paymentInfo.bcp.account}</p>
                  </div>
                  <CopyButton text={paymentInfo.bcp.account} />
                </div>
                {paymentInfo.bcp.cci && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-blue-500 uppercase">CCI</p>
                      <p className="text-sm font-mono font-medium text-blue-900">{paymentInfo.bcp.cci}</p>
                    </div>
                    <CopyButton text={paymentInfo.bcp.cci} />
                  </div>
                )}
                <p className="text-xs text-blue-600">Titular: {paymentInfo.titular}</p>
              </div>
            </div>
          )}
        </div>

        {/* Botón de WhatsApp */}
        <Button
          onClick={handleContactWhatsApp}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-base"
        >
          <MessageCircle className="w-5 h-5 mr-2" />
          Enviar captura por WhatsApp
        </Button>
      </div>
    </Modal>
  )
}
