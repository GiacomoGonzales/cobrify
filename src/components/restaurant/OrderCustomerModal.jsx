/**
 * Asignar el CLIENTE a una orden de mesa, escaneando su tarjeta de sellos.
 *
 * Por qué existe: el mozo tiene al cliente delante y su tarjeta en el celular,
 * pero el dato se pedía recién en la caja, a destiempo y a las apuradas. El QR
 * de la tarjeta (Google y Apple) lleva el TELÉFONO, que es exactamente la llave
 * con la que trabaja todo el sistema: con eso la orden queda identificada y, al
 * cerrar la cuenta, el POS precarga los datos del cliente y le suma su sello
 * SOLO — nadie teclea nada en caja.
 *
 * El teléfono manda sobre la cartera: si el número no está en Clientes, la
 * orden igual se asigna con el nombre de la tarjeta. La ficha de Clientes solo
 * aporta el documento, que es lo que hace falta para la boleta o factura.
 */
import { useState, useEffect } from 'react'
import { QrCode, Search, UserCheck, X, Loader2, Award } from 'lucide-react'
import { collection, getDocs, query, where, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useToast } from '@/contexts/ToastContext'
import { scanBarcode, scannerDisponible } from '@/utils/scanBarcode'
import { phoneKey, getLoyaltyCard, rewardLabel, programaVigente } from '@/services/loyaltyService'

export default function OrderCustomerModal({
  isOpen,
  onClose,
  businessId,
  order,
  loyaltyConfig = null,
  onAssign,
  onRemove,
}) {
  const toast = useToast()
  const [buscando, setBuscando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [telefonoManual, setTelefonoManual] = useState('')
  const [encontrado, setEncontrado] = useState(null)

  const puedeEscanear = scannerDisponible()
  const clienteActual = (order?.customerPhone || order?.customerName)
    ? {
        name: order.customerName,
        phone: order.customerPhone,
        documentNumber: order.customerDocumentNumber,
      }
    : null

  useEffect(() => {
    if (!isOpen) {
      setEncontrado(null)
      setTelefonoManual('')
    }
  }, [isOpen])

  /**
   * Con el teléfono en la mano: la ficha del cliente (para el documento) y su
   * tarjeta de sellos (para mostrarle al mozo cómo va). Ninguna es obligatoria.
   */
  const resolverTelefono = async (telefono) => {
    const key = phoneKey(telefono)
    if (!key) {
      toast.error('Ese código no tiene un celular válido')
      return
    }

    setBuscando(true)
    try {
      // La ficha se busca por el número tal cual y por la forma normalizada,
      // porque cada negocio lo guarda distinto ("987 654 321" vs "987654321").
      const ref = collection(db, 'businesses', businessId, 'customers')
      let hallados = []
      for (const valor of [...new Set([telefono, key])]) {
        const snap = await getDocs(query(ref, where('phone', '==', valor), limit(1)))
        if (!snap.empty) {
          hallados = snap.docs
          break
        }
      }
      const ficha = hallados.length ? { id: hallados[0].id, ...hallados[0].data() } : null

      const tarjeta = await getLoyaltyCard(businessId, key, loyaltyConfig)
      const card = tarjeta.success ? tarjeta.data : null

      if (!ficha && !card) {
        setEncontrado({ phone: key, nuevo: true, name: '' })
        return
      }

      setEncontrado({
        phone: key,
        customerId: ficha?.id || null,
        name: ficha?.name || card?.customerName || '',
        businessName: ficha?.businessName || '',
        documentType: ficha?.documentType || '',
        documentNumber: ficha?.documentNumber || '',
        card,
      })
    } catch (error) {
      console.error('Error al buscar el cliente:', error)
      toast.error('No se pudo buscar al cliente')
    } finally {
      setBuscando(false)
    }
  }

  const handleEscanear = async () => {
    try {
      const codigo = await scanBarcode({ avisar: toast })
      if (!codigo) return // cerró la cámara sin escanear
      // El QR de la tarjeta lleva el teléfono pelado. Si alguien escanea otra
      // cosa, phoneKey lo descarta y se avisa, en vez de asignar basura.
      await resolverTelefono(codigo)
    } catch (error) {
      toast.error(error.message || 'No se pudo escanear')
    }
  }

  const handleAsignar = async () => {
    if (!encontrado) return
    setGuardando(true)
    try {
      await onAssign({
        customerName: encontrado.name || 'Cliente',
        customerPhone: encontrado.phone,
        ...(encontrado.businessName && { customerBusinessName: encontrado.businessName }),
        ...(encontrado.documentType && { customerDocumentType: encontrado.documentType }),
        ...(encontrado.documentNumber && { customerDocumentNumber: encontrado.documentNumber }),
      })
      onClose()
    } finally {
      setGuardando(false)
    }
  }

  const sellos = encontrado?.card
  const vigente = programaVigente(loyaltyConfig || {})
  const premio = rewardLabel(loyaltyConfig || {})

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cliente de la mesa" size="md">
      <div className="space-y-4">
        {clienteActual && !encontrado && (
          <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="min-w-0">
              <p className="text-xs text-green-700">Cliente asignado</p>
              <p className="font-semibold text-gray-900 truncate">{clienteActual.name}</p>
              <p className="text-xs text-gray-600 truncate">
                {[clienteActual.phone, clienteActual.documentNumber].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onRemove} className="shrink-0">
              <X className="w-4 h-4 mr-1" />
              Quitar
            </Button>
          </div>
        )}

        {puedeEscanear ? (
          <Button onClick={handleEscanear} disabled={buscando} className="w-full py-6 text-base">
            {buscando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <QrCode className="w-5 h-5 mr-2" />}
            Escanear tarjeta del cliente
          </Button>
        ) : (
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
            El escaneo con cámara funciona en la app instalada. Acá puedes escribir el celular del cliente.
          </p>
        )}

        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              type="tel"
              inputMode="numeric"
              value={telefonoManual}
              onChange={(e) => setTelefonoManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && telefonoManual) resolverTelefono(telefonoManual)
              }}
              placeholder="Celular del cliente"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => resolverTelefono(telefonoManual)}
            disabled={!telefonoManual || buscando}
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>

        {encontrado && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            {encontrado.nuevo ? (
              <>
                <p className="text-sm text-gray-600">
                  El celular <strong>{encontrado.phone}</strong> todavía no tiene ficha ni tarjeta.
                  Puedes asignarlo igual y ponerle nombre.
                </p>
                <Input
                  value={encontrado.name}
                  onChange={(e) => setEncontrado({ ...encontrado, name: e.target.value })}
                  placeholder="Nombre del cliente"
                />
              </>
            ) : (
              <>
                <div>
                  <p className="font-semibold text-gray-900">{encontrado.name || 'Cliente'}</p>
                  <p className="text-xs text-gray-600">
                    {[encontrado.phone, encontrado.documentNumber].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {sellos && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <Award className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-900">
                      {!vigente
                        ? 'Su programa de sellos ya venció'
                        : (sellos.stamps || 0) >= (sellos.goal || 10)
                          ? `Premio disponible${premio ? `: ${premio}` : ''}`
                          : `${sellos.stamps || 0} de ${sellos.goal || 10} sellos`}
                    </p>
                  </div>
                )}
              </>
            )}
            <Button onClick={handleAsignar} disabled={guardando} className="w-full">
              {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
              Asignar a la mesa
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
