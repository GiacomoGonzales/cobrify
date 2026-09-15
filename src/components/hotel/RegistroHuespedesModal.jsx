import { useEffect, useState } from 'react'
import { Copy, Loader2, MessageCircle, Pencil, Save } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useToast } from '@/contexts/ToastContext'
import FormularioRegistroHuespedes from '@/components/hotel/FormularioRegistroHuespedes'
import { asegurarTokenPublico, guardarRegistroHuespedes } from '@/services/hotelService'
import {
  registroParaFormulario,
  normalizarRegistro,
  tieneRegistro,
  enlaceDeRegistro,
  mensajeDeRegistro,
  telefonoParaWhatsApp,
  fechaCorta,
  edadEn,
} from '@/utils/registroDeHuespedes'

const SEXO = { F: 'Femenino', M: 'Masculino' }

const cuando = (ts) => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * El REGISTRO DE HUÉSPEDES de una reserva, del lado del hotel
 * (utils/registroDeHuespedes): el enlace para mandárselo al huésped por
 * WhatsApp, lo que ya registró y la opción de llenarlo o corregirlo acá.
 */
export default function RegistroHuespedesModal({ isOpen, onClose, reservation, businessId, negocio, onActualizada, isDemoMode = false }) {
  const toast = useToast()
  const [modo, setModo] = useState('ver')
  const [valor, setValor] = useState(null)
  const [enlace, setEnlace] = useState('')
  const [preparandoEnlace, setPreparandoEnlace] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const registro = reservation?.registroHuespedes
  const completo = tieneRegistro(reservation)

  // Al abrir: el formulario con lo guardado (o vacío) y el enlace listo, así
  // "Enviar por WhatsApp" abre el chat en el mismo clic.
  useEffect(() => {
    if (!isOpen || !reservation) return undefined
    setModo(tieneRegistro(reservation) ? 'ver' : 'enviar')
    setValor(registroParaFormulario(reservation.registroHuespedes, reservation.guests))
    setEnlace('')
    if (isDemoMode || !businessId) return undefined
    let vigente = true
    setPreparandoEnlace(true)
    asegurarTokenPublico(businessId, reservation)
      .then((r) => {
        if (!vigente) return
        if (r.success) {
          setEnlace(enlaceDeRegistro(window.location.origin, businessId, r.token))
          if (r.token !== reservation.publicToken) onActualizada?.({ ...reservation, publicToken: r.token })
        } else {
          toast.error('No se pudo preparar el enlace del registro')
        }
      })
      .finally(() => { if (vigente) setPreparandoEnlace(false) })
    return () => { vigente = false }
    // Solo al abrir otra reserva: no volver a pedir el token en cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reservation?.id])

  if (!reservation) return null

  const enviarPorWhatsApp = () => {
    if (!enlace) return
    const telefono = telefonoParaWhatsApp(reservation.guestPhone || reservation.phone)
    const texto = mensajeDeRegistro({ negocio, reserva: reservation, enlace })
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  const copiarEnlace = async () => {
    if (!enlace) return
    try {
      await navigator.clipboard.writeText(enlace)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar. Mantén presionado el enlace para copiarlo.')
    }
  }

  const guardar = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    const { problema, registro: limpio } = normalizarRegistro(valor)
    if (problema) { toast.error(problema); return }
    setGuardando(true)
    try {
      const r = await guardarRegistroHuespedes(businessId, reservation.id, limpio)
      if (!r.success) { toast.error(r.error || 'No se pudo guardar el registro'); return }
      toast.success('Registro de huéspedes guardado')
      onActualizada?.({ ...reservation, registroHuespedes: { ...limpio, registradoPor: 'hotel', registradoAt: new Date() } })
      setModo('ver')
    } finally {
      setGuardando(false)
    }
  }

  const ingreso = reservation.checkInDate || reservation.checkIn
  const registrados = registro?.huespedes || []
  const personas = Number(reservation.guests) || 0

  return (
    <Modal isOpen={isOpen} onClose={() => !guardando && onClose()} title="Registro de huéspedes" size="lg">
      <div className="space-y-5">
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{reservation.guestName}</span>
          {' · '}{reservation.roomName || reservation.roomNumber}
          {' · '}{fechaCorta(ingreso)} al {fechaCorta(reservation.checkOutDate || reservation.checkOut)}
        </div>

        {/* Enlace para el huésped */}
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Enlace para el huésped</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Lo abre desde el celular, ve su reserva y registra a quienes se hospedan. Lo que envía aparece aquí.
            </p>
          </div>
          {isDemoMode ? (
            <p className="text-xs text-gray-500">En el modo demo no se generan enlaces.</p>
          ) : preparandoEnlace || !enlace ? (
            <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparando el enlace...</p>
          ) : (
            <p className="text-xs text-gray-700 break-all bg-gray-50 rounded-lg px-3 py-2 select-all">{enlace}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={enviarPorWhatsApp} disabled={!enlace} className="w-full sm:w-auto">
              <MessageCircle className="w-4 h-4 mr-1" /> Enviar por WhatsApp
            </Button>
            <Button variant="outline" onClick={copiarEnlace} disabled={!enlace} className="w-full sm:w-auto">
              <Copy className="w-4 h-4 mr-1" /> Copiar enlace
            </Button>
          </div>
        </div>

        {/* Lo registrado */}
        {modo === 'editar' ? (
          <div className="space-y-4">
            <FormularioRegistroHuespedes valor={valor} onCambio={setValor} deshabilitado={guardando} />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setModo(completo ? 'ver' : 'enviar')} disabled={guardando} className="w-full sm:w-auto">
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={guardando} className="w-full sm:w-auto">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Guardar registro</>}
              </Button>
            </div>
          </div>
        ) : completo ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm">
                <p className="font-semibold text-gray-900">Registro completo</p>
                <p className="text-xs text-gray-500">
                  Lo llenó {registro.registradoPor === 'hotel' ? 'el hotel' : 'el huésped'}
                  {cuando(registro.registradoAt) ? ` el ${cuando(registro.registradoAt)}` : ''}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setModo('editar')}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Corregir
              </Button>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-gray-500">Llegada</dt><dd className="text-gray-900">{registro.horaLlegada || '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Motivo</dt><dd className="text-gray-900">{registro.motivoViaje || '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Menores</dt><dd className="text-gray-900">{Number(registro.menores) || 'Ninguno'}</dd></div>
            </dl>
            {personas > 0 && personas !== registrados.length && (
              <p className="text-xs text-amber-700">
                La reserva es para {personas} persona{personas === 1 ? '' : 's'} y hay {registrados.length} registrada{registrados.length === 1 ? '' : 's'}.
              </p>
            )}
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {registrados.map((h, i) => {
                const edad = edadEn(h.fechaNacimiento, ingreso)
                return (
                  <li key={i} className="px-3 py-2 text-sm">
                    <p className="font-medium text-gray-900">{i === 0 ? 'Titular' : `Huésped ${i + 1}`}: {h.nombres} {h.apellidos}</p>
                    <p className="text-xs text-gray-500">
                      {[
                        `${h.tipoDocumento} ${h.documento}`,
                        SEXO[h.sexo],
                        h.fechaNacimiento && `${fechaCorta(h.fechaNacimiento)}${edad !== '' ? ` (${edad} años)` : ''}`,
                        [h.ciudad, h.pais].filter(Boolean).join(', '),
                        h.celular,
                        h.correo,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>El huésped todavía no llena su registro.</span>
            <Button size="sm" variant="outline" onClick={() => setModo('editar')}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Llenarlo yo
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
