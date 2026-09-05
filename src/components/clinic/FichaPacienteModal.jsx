/**
 * LA FICHA DEL PACIENTE (modo Clínica): lo que recepción necesita en cinco
 * segundos, en un solo lugar.
 *
 * Arriba, lo que decide la atención: alergia en rojo, próxima cita, última
 * atención, sesiones que le quedan y deuda. Abajo, pestañas con el detalle:
 * Resumen, Atenciones, Paquetes, Galería y Compras. Los datos se EDITAN en el
 * formulario de siempre (Editar); acá se leen.
 *
 * "Agendar cita" manda a la Agenda con ?agendar=<id>: se abre "Agendar cita"
 * con la persona ya elegida.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Calendar, MessageCircle, Edit, Trash2, Loader2, Package, ClipboardList, Receipt, Plus, ChevronRight,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { getAppointmentsDeCliente } from '@/services/appointmentService'
import { getInvoicesDeCliente, fechaDeComprobante } from '@/services/customerInvoiceService'
import { totalPorCobrarPorMoneda } from '@/services/receivablesService'
import { isPendingInvoice, getPendingAmount } from '@/utils/receivables'
import { normalizarAtenciones, edadDesde, fechaCorta } from '@/utils/fichaAtencion'
import { linkWhatsApp, fechaLargaDeCita, horaDeCita } from '@/utils/mensajeCita'
import { prefijoDeRuta } from '@/utils/demoRoutes'
import { formatCurrency } from '@/lib/utils'
import { PaquetesPaciente } from './PaquetesPacienteModal'
import { GaleriaPaciente } from './GaleriaPacienteModal'
import AnamnesisPaciente from './AnamnesisPaciente'
import { normalizarAnamnesis, resumenDeAnamnesis, alertasDeAnamnesis, anamnesisTieneDatos, normalizarPreguntas } from '@/utils/anamnesis'

const PESTANAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'anamnesis', label: 'Anamnesis' },
  { id: 'atenciones', label: 'Atenciones' },
  { id: 'paquetes', label: 'Paquetes' },
  { id: 'galeria', label: 'Galería' },
  { id: 'compras', label: 'Compras' },
]
const ACTIVAS = ['scheduled', 'confirmed', 'in_progress']

const iniciales = (nombre) =>
  String(nombre || '').trim().split(/\s+/).slice(0, 2).map(p => (p[0] || '').toUpperCase()).join('') || '?'

const msDe = (appt) => appt?.scheduledDate?.toMillis?.()
  || (appt?.scheduledDate ? new Date(appt.scheduledDate).getTime() : 0)

const estadoDePago = (inv) => {
  if (inv.status === 'cancelled' || inv.status === 'voided' || inv.sunatStatus === 'voided') {
    return { texto: 'Anulado', chip: 'chip-neutro' }
  }
  if (isPendingInvoice(inv)) {
    return { texto: inv.paymentStatus === 'partial' ? 'Pago parcial' : 'Pendiente', chip: 'chip-aviso' }
  }
  return { texto: 'Pagado', chip: 'chip-ok' }
}

const montoDe = (inv, valor) =>
  String(inv.currency || 'PEN').toUpperCase() === 'USD' ? `US$ ${(Number(valor) || 0).toFixed(2)}` : formatCurrency(Number(valor) || 0)

/** Una de las cuatro cajas de "de un vistazo". */
const Dato = ({ titulo, icono: Icono, children }) => (
  <div className="border border-gray-200 rounded-lg p-3 min-w-0">
    <p className="text-[11px] font-medium tracking-wide text-gray-500 uppercase flex items-center gap-1.5 mb-1.5">
      <Icono className="w-3.5 h-3.5" /> {titulo}
    </p>
    {children}
  </div>
)

const Campo = ({ etiqueta, children }) => (
  <div>
    <p className="text-xs font-medium text-gray-500">{etiqueta}</p>
    <p className="text-sm text-gray-900 whitespace-pre-line">{children || <span className="text-gray-400">—</span>}</p>
  </div>
)

export default function FichaPacienteModal({ isOpen, onClose, customer, onEdit, onDelete, onChanged }) {
  const { getBusinessId, isDemoMode, businessSettings } = useAppContext()
  const location = useLocation()
  const navigate = useNavigate()
  const prefijo = prefijoDeRuta(location.pathname, isDemoMode)
  const preguntas = normalizarPreguntas(businessSettings?.anamnesisQuestions)

  // Todos los hooks antes de cualquier return (React #310).
  const [pestana, setPestana] = useState('resumen')
  const [citas, setCitas] = useState([])
  const [compras, setCompras] = useState([])
  const [cargando, setCargando] = useState(false)

  const customerId = customer?.id

  useEffect(() => {
    if (!isOpen || !customerId) return
    let vivo = true
    setPestana('resumen')
    if (isDemoMode) { setCitas([]); setCompras([]); return }
    setCargando(true)
    const businessId = getBusinessId()
    Promise.all([
      getAppointmentsDeCliente(businessId, customerId).catch(() => []),
      getInvoicesDeCliente(businessId, customer).catch(() => []),
    ])
      .then(([c, i]) => { if (vivo) { setCitas(c); setCompras(i) } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, customerId])

  const atenciones = useMemo(
    () => normalizarAtenciones(customer).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    [customer],
  )
  const ultima = atenciones[0] || null

  // La siguiente cita activa. Una en atención ahora mismo cuenta como "la de hoy".
  const proxima = useMemo(() => {
    const desde = Date.now() - 60 * 60 * 1000
    return citas
      .filter(c => ACTIVAS.includes(c.status) && msDe(c) >= desde)
      .sort((a, b) => msDe(a) - msDe(b))[0] || null
  }, [citas])

  const pendientes = useMemo(() => compras.filter(isPendingInvoice), [compras])
  const deuda = useMemo(() => totalPorCobrarPorMoneda(pendientes), [pendientes])
  const debe = deuda.PEN > 0.01 || deuda.USD > 0.01
  const sesiones = Number(customer?.packagesSummary?.remaining) || 0
  const paquetesActivos = Number(customer?.packagesSummary?.active) || 0
  const edad = edadDesde(customer?.birthDate)
  // Lo que hay que ver antes de atender sale de la anamnesis; sin anamnesis,
  // de los dos campos simples de la ficha (alergias, antecedentes).
  const anamnesis = useMemo(() => normalizarAnamnesis(customer), [customer])
  const avisos = alertasDeAnamnesis(anamnesis)
  const resumenAnamnesis = useMemo(() => resumenDeAnamnesis(anamnesis, preguntas), [anamnesis, preguntas])
  const conAnamnesis = anamnesisTieneDatos(anamnesis, preguntas)

  if (!customer) return null

  const agendar = () => {
    onClose?.()
    navigate(`${prefijo}/agenda?agendar=${customerId}`)
  }
  const whatsapp = () => window.open(linkWhatsApp(customer.phone, ''), '_blank')

  const lineaDeContacto = [
    edad != null ? `${edad} años` : null,
    customer.documentNumber ? `${customer.documentType || 'DNI'} ${customer.documentNumber}` : null,
    customer.phone || null,
  ].filter(Boolean).join(' · ')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ficha del paciente" size="5xl" fullScreenMobile>
      <div className="space-y-5">
        {/* Cabecera */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-lg font-bold flex-shrink-0">
            {iniciales(customer.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-gray-900 truncate">{customer.name}</h2>
            <p className="text-sm text-gray-600 mt-0.5">{lineaDeContacto || 'Sin datos de contacto'}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {/* Rojo a propósito: es lo único que hay que ver antes de atender. */}
              {customer.allergies && (
                <span className="chip-error px-2 py-0.5 rounded-full text-xs font-medium">Alergia: {customer.allergies}</span>
              )}
              {avisos.map(aviso => (
                <span key={aviso} className="chip-aviso px-2 py-0.5 rounded-full text-xs font-medium">{aviso}</span>
              ))}
              {sesiones > 0 && (
                <span className="chip-info px-2 py-0.5 rounded-full text-xs font-medium">
                  {sesiones} {sesiones === 1 ? 'sesión disponible' : 'sesiones disponibles'}
                </span>
              )}
              {debe && (
                <span className="chip-aviso px-2 py-0.5 rounded-full text-xs font-medium">
                  Debe {formatCurrency(deuda.PEN)}{deuda.USD > 0.01 && ` + US$ ${deuda.USD.toFixed(2)}`}
                </span>
              )}
              {customer.referredBy && (
                <span className="chip-neutro px-2 py-0.5 rounded-full text-xs font-medium">Recomendado por {customer.referredBy}</span>
              )}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={agendar} className="gap-1">
            <Calendar className="w-4 h-4" /> Agendar cita
          </Button>
          {customer.phone && (
            <Button variant="outline" onClick={whatsapp} className="gap-1">
              <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
            </Button>
          )}
          <Button variant="outline" onClick={() => onEdit?.(customer)} className="gap-1">
            <Edit className="w-4 h-4" /> Editar
          </Button>
          <Button variant="ghost" onClick={() => onDelete?.(customer)} className="gap-1 text-red-600 hover:bg-red-50 sm:ml-auto">
            <Trash2 className="w-4 h-4" /> Eliminar
          </Button>
        </div>

        {/* De un vistazo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Dato titulo="Próxima cita" icono={Calendar}>
            {cargando ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
            ) : proxima ? (
              <>
                <p className="text-sm font-semibold text-gray-900 capitalize truncate">{fechaLargaDeCita(proxima)}</p>
                <p className="text-xs text-gray-500 truncate">{horaDeCita(proxima)} · {proxima.serviceName || 'Cita'}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Sin cita programada</p>
            )}
          </Dato>
          <Dato titulo="Última atención" icono={ClipboardList}>
            {ultima ? (
              <>
                <p className="text-sm font-semibold text-gray-900">{fechaCorta(ultima.date) || 'Sin fecha'}</p>
                <p className="text-xs text-gray-500 truncate">{ultima.service || ultima.treatment || '-'}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Ninguna registrada</p>
            )}
          </Dato>
          <Dato titulo="Sesiones disponibles" icono={Package}>
            <p className="text-sm font-semibold text-gray-900">{sesiones}</p>
            <p className="text-xs text-gray-500">
              {paquetesActivos > 0
                ? `${paquetesActivos} ${paquetesActivos === 1 ? 'paquete activo' : 'paquetes activos'}`
                : 'Sin paquetes activos'}
            </p>
          </Dato>
          <Dato titulo="Deuda pendiente" icono={Receipt}>
            {cargando ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
            ) : (
              <>
                <p className={`text-sm font-semibold ${debe ? 'text-amber-700' : 'text-gray-900'}`}>
                  {formatCurrency(deuda.PEN)}{deuda.USD > 0.01 && ` + US$ ${deuda.USD.toFixed(2)}`}
                </p>
                <p className="text-xs text-gray-500">
                  {pendientes.length > 0
                    ? `${pendientes.length} ${pendientes.length === 1 ? 'comprobante con saldo' : 'comprobantes con saldo'}`
                    : 'Al día'}
                </p>
              </>
            )}
          </Dato>
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {PESTANAS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPestana(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                pestana === t.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {pestana === 'resumen' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-4">
              <p className="text-[11px] font-medium tracking-wide text-gray-500 uppercase">Antes de atender</p>
              {resumenAnamnesis.map(fila => (
                <div key={fila.etiqueta}>
                  <p className="text-xs font-medium text-gray-500">{fila.etiqueta}</p>
                  <p className={`text-sm whitespace-pre-line ${fila.importante ? 'text-red-700 font-medium' : 'text-gray-900'}`}>{fila.valor}</p>
                </div>
              ))}
              {!conAnamnesis && (
                <p className="text-xs text-gray-500">
                  Todavía no tiene anamnesis: enfermedades, medicación y hábitos se llenan en la pestaña <strong>Anamnesis</strong>.
                </p>
              )}
              <button type="button" onClick={() => setPestana('anamnesis')} className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5">
                {conAnamnesis ? 'Ver o corregir la anamnesis' : 'Llenar la anamnesis'} <ChevronRight className="w-4 h-4" />
              </button>
              <Campo etiqueta="Recomendado por">{customer.referredBy}</Campo>
            </div>
            <div className="space-y-4">
              <p className="text-[11px] font-medium tracking-wide text-gray-500 uppercase">Datos</p>
              <Campo etiqueta="Cumpleaños">{customer.birthDate ? `${fechaCorta(customer.birthDate)}${edad != null ? ` (${edad} años)` : ''}` : ''}</Campo>
              <Campo etiqueta="Correo">{customer.email}</Campo>
              <Campo etiqueta="Dirección">{customer.address}</Campo>
            </div>
          </div>
        )}

        {pestana === 'anamnesis' && (
          <AnamnesisPaciente customer={customer} preguntas={preguntas} onSaved={onChanged} />
        )}

        {pestana === 'atenciones' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                {atenciones.length === 0 ? 'Sin atenciones registradas.' : `${atenciones.length} ${atenciones.length === 1 ? 'atención' : 'atenciones'}, la más reciente primero.`}
              </p>
              <Button size="sm" variant="outline" onClick={() => onEdit?.(customer)} className="gap-1">
                <Plus className="w-4 h-4" /> Agregar atención
              </Button>
            </div>
            {atenciones.map(a => (
              <div key={a.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">
                    {fechaCorta(a.date) || 'Sin fecha'}{a.service && ` · ${a.service}`}
                  </p>
                  {a.specialist && <span className="chip-neutro px-2 py-0.5 rounded-full text-xs">{a.specialist}</span>}
                </div>
                {a.treatment && (
                  <p className="text-sm text-gray-700 mt-1"><span className="text-gray-500">Tratamiento: </span>{a.treatment}</p>
                )}
                {a.recommendations && (
                  <p className="text-sm text-gray-700 mt-1"><span className="text-gray-500">Recomendaciones: </span>{a.recommendations}</p>
                )}
                {a.nextControlDate && (
                  <p className="text-xs text-primary-700 mt-1">
                    Próximo control: {fechaCorta(a.nextControlDate)}{a.nextControlTime && ` a las ${a.nextControlTime}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {pestana === 'paquetes' && (
          <PaquetesPaciente customer={customer} onChanged={onChanged} />
        )}

        {pestana === 'galeria' && (
          <GaleriaPaciente customer={customer} />
        )}

        {pestana === 'compras' && (
          <div className="space-y-3">
            {cargando ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
            ) : compras.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Sin compras registradas a su nombre.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {compras.slice(0, 30).map(inv => {
                  const e = estadoDePago(inv)
                  const saldo = getPendingAmount(inv)
                  const f = fechaDeComprobante(inv)
                  const items = (inv.items || []).map(i => i.name || i.description).filter(Boolean)
                  return (
                    <div key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{inv.number || inv.fullNumber || 'Sin número'}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {f ? f.toLocaleDateString('es-PE') : ''}{items.length > 0 && ` · ${items.slice(0, 2).join(', ')}${items.length > 2 ? '…' : ''}`}
                        </p>
                      </div>
                      <span className={`${e.chip} px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0`}>{e.texto}</span>
                      <div className="text-right w-28 flex-shrink-0">
                        <p className="font-semibold text-gray-900">{montoDe(inv, inv.total)}</p>
                        {isPendingInvoice(inv) && saldo > 0.01 && (
                          <p className="text-[11px] text-amber-700">Debe {montoDe(inv, saldo)}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <Link to={`${prefijo}/facturas`} className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5">
              Ver en Ventas <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </Modal>
  )
}
