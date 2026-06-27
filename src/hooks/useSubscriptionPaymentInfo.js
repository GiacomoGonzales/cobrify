import { useState, useEffect } from 'react'
import { getVendedor } from '@/services/vendedorService'
import { getResellerPaymentInfo } from '@/services/brandingService'

const DEFAULT_WHATSAPP = '51900434988'

// Datos de cobro de Cobrify (solo para clientes DIRECTOS, sin reseller ni vendedor).
const DEFAULT_PAYMENT_INFO = {
  yape: { number: '926 258 059', name: 'Quantio Solutions EIRL' },
  bcp: { account: '1937311451039', cci: '00219300731145103916' },
  titular: 'Quantio Solutions EIRL',
}

/**
 * Resuelve qué datos de pago mostrar en la pantalla de "suscripción vencida".
 *
 * - Cliente de un RESELLER (subscription.resellerId): muestra los datos de cobro del
 *   reseller. Si el reseller aún no los configuró, NO cae a los datos de Cobrify
 *   (`isResellerWithoutPayment = true`) → la UI muestra "contacta a tu proveedor".
 * - Cliente con VENDEDOR (subscription.vendedorId): datos del vendedor (sistema legacy).
 * - Cliente DIRECTO de Cobrify: datos de Cobrify por defecto.
 *
 * Así un cliente de reseller nunca ve (ni le paga a) la cuenta de Cobrify.
 */
export function useSubscriptionPaymentInfo(subscription) {
  const isReseller = !!subscription?.resellerId
  const [seller, setSeller] = useState(null)
  const [loading, setLoading] = useState(!!(subscription?.resellerId || subscription?.vendedorId))

  useEffect(() => {
    let active = true
    if (subscription?.resellerId) {
      setLoading(true)
      getResellerPaymentInfo(subscription.resellerId)
        .then((r) => { if (active && r.success) setSeller(r.data) })
        .finally(() => { if (active) setLoading(false) })
    } else if (subscription?.vendedorId) {
      setLoading(true)
      getVendedor(subscription.vendedorId)
        .then((r) => { if (active && r.success) setSeller(r.data) })
        .finally(() => { if (active) setLoading(false) })
    } else {
      setLoading(false)
    }
    return () => { active = false }
  }, [subscription?.resellerId, subscription?.vendedorId])

  const sellerHasPayment = !!(seller && (seller.yapeNumber || seller.bcpAccount))

  const paymentInfo = sellerHasPayment
    ? {
        yape: { number: seller.yapeNumber || '', name: seller.yapeName || seller.titular || '' },
        bcp: { account: seller.bcpAccount || '', cci: seller.bcpCci || '' },
        titular: seller.titular || '',
      }
    : (isReseller ? null : DEFAULT_PAYMENT_INFO) // reseller sin datos → NO mostrar Cobrify

  const whatsappNumber = isReseller
    ? (seller?.whatsapp || seller?.phone || subscription?.resellerBranding?.whatsapp || DEFAULT_WHATSAPP)
    : (seller?.phone || DEFAULT_WHATSAPP)

  const yapeRaw = (paymentInfo?.yape?.number || '').replace(/\s/g, '')

  return {
    loading,
    paymentInfo,
    whatsappNumber,
    yapeRaw,
    // true = cliente de reseller que aún no configuró sus datos de cobro.
    isResellerWithoutPayment: isReseller && !sellerHasPayment,
  }
}
