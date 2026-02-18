import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getVendedor } from '@/services/vendedorService';
import { AlertTriangle, Copy, Check, Smartphone, Building2, MessageCircle } from 'lucide-react';

const DEFAULT_WHATSAPP = '51900434988';

const DEFAULT_PAYMENT_INFO = {
  yape: { number: '926 258 059', name: 'Quantio Solutions EIRL' },
  bcp: { account: '1937311451039', cci: '00219300731145103916' },
  titular: 'Quantio Solutions EIRL',
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white/60 hover:bg-white/80 rounded transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-gray-500" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

export default function AccountSuspended() {
  const { user, subscription, logout } = useAuth();
  const [vendedor, setVendedor] = useState(null);

  useEffect(() => {
    if (subscription?.vendedorId) {
      getVendedor(subscription.vendedorId).then(result => {
        if (result.success) setVendedor(result.data);
      });
    }
  }, [subscription?.vendedorId]);

  const paymentInfo = vendedor
    ? {
        yape: { number: vendedor.yapeNumber, name: vendedor.yapeName },
        bcp: { account: vendedor.bcpAccount, cci: vendedor.bcpCci },
        titular: vendedor.titular,
      }
    : DEFAULT_PAYMENT_INFO;

  const whatsappNumber = vendedor?.phone || DEFAULT_WHATSAPP;
  const yapeRaw = vendedor ? vendedor.yapeNumber.replace(/\s/g, '') : '926258059';

  const whatsappMessage = encodeURIComponent(
    `Hola, quiero renovar mi suscripción de Cobrify. Mi email es ${user?.email || ''}. Mi negocio es ${subscription?.businessName || ''}.`
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-500 to-orange-500 p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-4">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Tu suscripción ha vencido</h1>
            <p className="text-red-100 text-base">
              Realiza el pago a las siguientes cuentas y envía la captura al WhatsApp para reactivar tu cuenta.
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {/* Datos de pago */}
            <div className="space-y-3 mb-6">
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

              {/* BCP */}
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

            {/* Botones */}
            <div className="flex flex-col gap-3">
              <a
                href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                Enviar captura por WhatsApp
              </a>
              <button
                onClick={logout}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
