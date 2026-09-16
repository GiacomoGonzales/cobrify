import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { useActualizacion } from '@/contexts/ActualizacionContext'
import { aplazarRecargas } from '@/utils/fallosDeCarga'
import { Modal, Campo, Entrada, Selector, Casilla, Boton, Aviso } from '@/components/admin/ui'
import { formatearNumero, msRestantesDeVentana } from '@/services/whatsappChatService'
import {
  ETIQUETA_TIPO,
  METODOS_DE_COBRO,
  armarComprobante,
  cargarEmisor,
  cargarGeneradorPdf,
  comprobantesParaReenviar,
  completarCliente,
  desglose as calcularDesglose,
  emitirComprobante,
  enviarASunat,
  enviarPdfPorWhatsapp,
  leerComprobante,
  numeroProbable,
  productoSugerido,
  sePuedeReenviar,
  soloDigitos,
  textoDelEnvio,
  tipoPorDocumento,
} from '@/services/comprobanteChatService'

const dinero = (n) => `S/ ${(Number(n) || 0).toFixed(2)}`

/**
 * Emitir un comprobante y mandarlo por WhatsApp sin salir de la conversación.
 *
 * Hasta ahora el camino era chat → POS → emitir → descargar → volver al chat
 * → adjuntar. Acá es una ventana: el cliente ya viene puesto si la
 * conversación está vinculada, el producto se sugiere según su plan, y al
 * confirmar se emite, va a SUNAT y el PDF aparece en la conversación.
 *
 * El orden de los pasos protege el correlativo: la ventana de 24 h se revisa
 * ANTES de emitir (un comprobante que no se puede enviar no se emite), y el
 * PDF se manda solo después de que SUNAT aceptó — mandarle a un cliente una
 * factura rechazada es peor que hacerlo esperar diez segundos.
 */
export default function ModalEmitirComprobante({ conversacion, ficha, onCerrar, onEmitido }) {
  const toast = useToast()
  const { user } = useAuth()

  const [emisor, setEmisor] = useState(null)
  const [errorEmisor, setErrorEmisor] = useState('')

  // Cliente. Si la conversación está vinculada ya se sabe quién es.
  const [documento, setDocumento] = useState(soloDigitos(ficha?.ruc))
  const [nombre, setNombre] = useState(ficha?.nombre || '')
  const [direccion, setDireccion] = useState(ficha?.direccion || '')
  const [buscandoDoc, setBuscandoDoc] = useState(false)
  const [docNoEncontrado, setDocNoEncontrado] = useState(false)
  // El documento prefijado no se vuelve a consultar: ya está en la cuenta.
  const ultimoConsultado = useRef(soloDigitos(ficha?.ruc))

  // Comprobante.
  const [tipo, setTipo] = useState(tipoPorDocumento(ficha?.ruc))
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [precio, setPrecio] = useState('')
  const [igvAparte, setIgvAparte] = useState(false)
  const [metodo, setMetodo] = useState('Yape')

  // Avance: formulario → emitiendo → sunat → enviando → listo, o fallo.
  const [paso, setPaso] = useState('formulario')
  const [comprobante, setComprobante] = useState(null)
  const [fallo, setFallo] = useState(null)
  // El generador del PDF se pide al abrir y, mientras la ventana siga abierta,
  // nada recarga la página sola (ver usePreparacionDelPdf).
  const pdf = usePreparacionDelPdf()

  useEffect(() => {
    let vivo = true
    cargarEmisor(user.uid)
      .then((e) => {
        if (!vivo) return
        setEmisor(e)
        const sugerido = productoSugerido(e.productos, ficha)
        if (sugerido) {
          setProductoId(sugerido.id)
          // El precio pactado manda sobre el de lista: hay clientes antiguos
          // con tarifa propia.
          setPrecio(String(ficha?.renewalPrice ?? sugerido.price))
        }
      })
      .catch((error) => { if (vivo) setErrorEmisor(error.message || 'No se pudo cargar tu cuenta') })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid])

  // Al completar un RUC o un DNI se consulta y se rellena el nombre. El tipo
  // sigue al documento: RUC → factura, DNI → boleta, nada → nota de venta.
  useEffect(() => {
    const d = soloDigitos(documento)
    setTipo(tipoPorDocumento(d))
    setDocNoEncontrado(false)
    if ((d.length !== 11 && d.length !== 8) || d === ultimoConsultado.current) return undefined
    ultimoConsultado.current = d
    let vivo = true
    setBuscandoDoc(true)
    completarCliente(d)
      .then((r) => {
        if (!vivo) return
        if (r) {
          setNombre(r.nombre)
          setDireccion(r.direccion)
        } else {
          setDocNoEncontrado(true)
        }
      })
      .catch(() => { if (vivo) setDocNoEncontrado(true) })
      .finally(() => { if (vivo) setBuscandoDoc(false) })
    return () => { vivo = false }
  }, [documento])

  const alCambiarProducto = (id) => {
    setProductoId(id)
    const p = emisor?.productos.find((x) => x.id === id)
    if (p) setPrecio(String(p.price))
  }

  const producto = emisor?.productos.find((p) => p.id === productoId) || null
  const igvRate = emisor?.igvRate || 18
  const d = calcularDesglose({ precio, cantidad, igvAparte, igvRate })
  const digitos = soloDigitos(documento)
  const ventanaAbierta = msRestantesDeVentana(conversacion) > 0

  const errorDocumento = (() => {
    if (tipo === 'factura' && digitos.length !== 11) return 'Una factura necesita un RUC de 11 dígitos'
    if (tipo === 'boleta' && digitos.length && digitos.length !== 8 && digitos.length !== 11) return 'Escribe un DNI de 8 dígitos, o deja el campo vacío'
    return ''
  })()
  const faltaNombre = digitos.length > 0 && !nombre.trim()
  const valido = !!producto && d.total > 0 && !errorDocumento && !faltaNombre && !buscandoDoc
  const trabajando = paso === 'emitiendo' || paso === 'sunat' || paso === 'enviando'

  const emitir = async () => {
    if (!valido || !ventanaAbierta || trabajando || pdf !== 'listo') return
    const datos = armarComprobante({
      tipo,
      cliente: {
        documento: digitos,
        nombre,
        direccion,
        email: ficha?.email || '',
        telefono: conversacion?.waId || '',
      },
      producto,
      desglose: d,
      metodo,
      igvRate,
      emisor: user,
      conversacionId: conversacion.id,
    })
    setPaso('emitiendo')
    let creado
    try {
      creado = await emitirComprobante(user.uid, datos)
    } catch (error) {
      toast.error(error.message || 'No se pudo emitir el comprobante')
      setPaso('formulario')
      return
    }
    const nuevo = { id: creado.id, number: creado.number, documentType: tipo, total: d.total }
    setComprobante(nuevo)
    await pasarPorSunat(nuevo)
  }

  const pasarPorSunat = async (c) => {
    if (c.documentType !== 'nota_venta') {
      setPaso('sunat')
      const r = await enviarASunat(user.uid, c.id)
      if (r.estado !== 'aceptado') {
        setFallo({ etapa: 'sunat', estado: r.estado, mensaje: r.mensaje })
        setPaso('fallo')
        return
      }
    }
    await mandarPorWhatsapp(c)
  }

  const mandarPorWhatsapp = async (c) => {
    setPaso('enviando')
    try {
      const completo = await leerComprobante(user.uid, c.id)
      const idToken = await auth.currentUser.getIdToken()
      await enviarPdfPorWhatsapp({
        uid: user.uid,
        comprobante: completo,
        ajustes: emisor.ajustes,
        conversacionId: conversacion.id,
        idToken,
      })
      setPaso('listo')
      toast.success(`${ETIQUETA_TIPO[c.documentType]} ${c.number} enviada`)
      onEmitido?.(completo)
    } catch (error) {
      setFallo({ etapa: 'whatsapp', mensaje: error.message || 'No se pudo enviar el PDF' })
      setPaso('fallo')
    }
  }

  const etiqueta = ETIQUETA_TIPO[tipo]
  const destinatario = conversacion?.nombre || formatearNumero(conversacion?.waId)

  const pie = (() => {
    if (trabajando) {
      return (
        <Boton variante="primario" disabled>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {paso === 'emitiendo' ? 'Emitiendo…' : paso === 'sunat' ? 'Enviando a SUNAT…' : 'Enviando por WhatsApp…'}
        </Boton>
      )
    }
    if (paso === 'fallo') {
      const reintentable = fallo.etapa === 'whatsapp' || fallo.estado === 'pendiente' || fallo.estado === 'error'
      return (
        <>
          <Boton onClick={onCerrar}>Cerrar</Boton>
          {reintentable && (
            <Boton
              variante="primario"
              onClick={() => (fallo.etapa === 'whatsapp' ? mandarPorWhatsapp(comprobante) : pasarPorSunat(comprobante))}
            >
              {fallo.etapa === 'whatsapp' ? 'Reenviar por WhatsApp' : 'Reintentar'}
            </Boton>
          )}
        </>
      )
    }
    if (paso === 'listo') return <Boton onClick={onCerrar}>Cerrar</Boton>
    return (
      <>
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" onClick={emitir} disabled={!valido || !ventanaAbierta || !emisor || pdf !== 'listo'}>
          {valido ? `Emitir ${etiqueta.toLowerCase()} y enviar` : 'Emitir y enviar'}
        </Boton>
      </>
    )
  })()

  return (
    <Modal
      titulo="Emitir comprobante"
      subtitulo={ficha?.nombre || destinatario}
      ancho="md"
      onClose={trabajando ? undefined : onCerrar}
      pie={pie}
    >
      {paso !== 'formulario' ? (
        <Avance paso={paso} tipo={tipo} comprobante={comprobante} fallo={fallo} />
      ) : (
        <div className="space-y-4">
          {errorEmisor && <Aviso tono="rojo" titulo="No se puede emitir desde tu cuenta">{errorEmisor}</Aviso>}

          {pdf === 'fallo' && <AvisoVersionVieja />}

          {!ventanaAbierta && (
            <Aviso tono="rojo" titulo="La ventana de 24 horas está cerrada">
              WhatsApp no deja mandar archivos hasta que el cliente vuelva a escribir. Por eso no se
              emite todavía: un comprobante que no se puede enviar gastaría un número. Si lo necesitas
              ahora, emítelo desde Ventas.
            </Aviso>
          )}

          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-gray-900">Cliente</h4>
            <Campo
              etiqueta="RUC o DNI"
              error={errorDocumento || (docNoEncontrado ? 'No se encontró. Escribe el nombre a mano.' : '')}
              ayuda={buscandoDoc ? 'Buscando…' : 'Se completa solo desde SUNAT o RENIEC'}
            >
              <Entrada
                inputMode="numeric"
                maxLength={11}
                value={documento}
                onChange={(e) => setDocumento(soloDigitos(e.target.value))}
                placeholder="20601234567"
              />
            </Campo>
            <Campo etiqueta="Razón social o nombre" error={faltaNombre ? 'Falta el nombre' : ''}>
              <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Campo>
            <Campo etiqueta="Dirección">
              <Entrada value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Opcional" />
            </Campo>
          </section>

          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-gray-900">Comprobante</h4>
            <Campo etiqueta="Tipo">
              <Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="factura" disabled={digitos.length !== 11}>Factura</option>
                <option value="boleta">Boleta</option>
                <option value="nota_venta">Nota de venta</option>
              </Selector>
            </Campo>
            <Campo etiqueta="Concepto">
              <Selector value={productoId} onChange={(e) => alCambiarProducto(e.target.value)} disabled={!emisor}>
                <option value="">{emisor ? 'Elige qué se cobra' : 'Cargando…'}</option>
                {(emisor?.productos || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {dinero(p.price)}</option>
                ))}
              </Selector>
            </Campo>
            <div className="grid grid-cols-3 gap-2">
              <Campo etiqueta="Cantidad">
                <Entrada type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </Campo>
              <Campo etiqueta={igvAparte ? 'Precio sin IGV (S/)' : 'Precio (S/)'} className="col-span-2">
                <Entrada type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
              </Campo>
            </div>
            <Casilla
              etiqueta="El precio no incluye IGV: agregarlo aparte"
              ayuda="Para quien paga el impuesto encima, como los resellers. Lo normal es que el precio ya lo incluya."
              checked={igvAparte}
              onChange={(e) => setIgvAparte(e.target.checked)}
            />
            <Campo etiqueta="Método de pago">
              <Selector value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS_DE_COBRO.map((m) => <option key={m} value={m}>{m}</option>)}
              </Selector>
            </Campo>
          </section>

          <div className="rounded-md bg-gray-50 px-3 py-2 space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-gray-500">
                {igvAparte
                  ? `${dinero(d.base)} + IGV ${igvRate}% ${dinero(d.igv)}`
                  : `Incluye IGV ${igvRate}%: ${dinero(d.igv)}`}
              </span>
              <span className="text-[14px] font-semibold text-gray-900">{dinero(d.total)}</span>
            </div>
            <p className="text-[11.5px] text-gray-500">
              Va como PDF a {destinatario} con el texto:{' '}
              <span className="text-gray-700">
                «{textoDelEnvio({ documentType: tipo, number: numeroProbable(emisor?.ajustes, tipo, emisor?.uid), total: d.total })}»
              </span>
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * Los pasos, uno debajo del otro, con el que va en curso girando. Cuando
 * algo falla se ve exactamente dónde, y el aviso dice qué quedó hecho: si
 * el comprobante ya se emitió, ya existe en Ventas aunque no haya llegado.
 */
function Avance({ paso, tipo, comprobante, fallo }) {
  const pasos = [
    { id: 'emitiendo', texto: comprobante ? `${ETIQUETA_TIPO[tipo]} ${comprobante.number} emitida` : `Emitiendo ${ETIQUETA_TIPO[tipo].toLowerCase()}` },
    ...(tipo !== 'nota_venta' ? [{ id: 'sunat', texto: 'Enviada a SUNAT' }] : []),
    { id: 'enviando', texto: 'PDF enviado por WhatsApp' },
  ]
  const enCurso = paso === 'fallo' ? (fallo.etapa === 'sunat' ? 'sunat' : 'enviando') : paso
  const indice = (id) => pasos.findIndex((p) => p.id === id)
  const actual = paso === 'listo' ? pasos.length : indice(enCurso)

  const estadoDe = (i) => {
    if (i < actual) return 'listo'
    if (i > actual) return 'pendiente'
    return paso === 'fallo' ? 'fallo' : 'curso'
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {pasos.map((p, i) => {
          const estado = estadoDe(i)
          return (
            <li key={p.id} className="flex items-center gap-2.5">
              {estado === 'listo' && <Check className="w-4 h-4 text-primary-600 flex-none" />}
              {estado === 'curso' && <Loader2 className="w-4 h-4 text-primary-600 animate-spin flex-none" />}
              {estado === 'fallo' && <AlertCircle className="w-4 h-4 text-red-600 flex-none" />}
              {estado === 'pendiente' && <span className="w-4 h-4 flex-none flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-gray-300" /></span>}
              <span className={estado === 'pendiente' ? 'text-gray-400' : estado === 'fallo' ? 'text-red-700' : 'text-gray-900'}>
                {p.texto}
              </span>
            </li>
          )
        })}
      </ol>

      {paso === 'fallo' && fallo.etapa === 'sunat' && (
        <Aviso tono="rojo" titulo={fallo.estado === 'rechazado' ? 'SUNAT la rechazó' : 'SUNAT no respondió'}>
          {fallo.mensaje}
          {' '}
          {fallo.estado === 'rechazado'
            ? 'Quedó en Ventas como rechazada; el PDF no se envió.'
            : 'Quedó en Ventas como pendiente y se reintentará sola. El PDF no se envió.'}
        </Aviso>
      )}

      {paso === 'fallo' && fallo.etapa === 'whatsapp' && (
        <Aviso tono="rojo" titulo="Se emitió, pero no se pudo enviar">
          {fallo.mensaje} El comprobante ya existe en Ventas: reenvíalo desde acá sin emitir otro.
        </Aviso>
      )}

      {paso === 'listo' && (
        <Aviso titulo="Listo">El PDF ya está en la conversación.</Aviso>
      )}
    </div>
  )
}

/**
 * Prepara el generador del PDF al abrir una ventana y, mientras siga abierta,
 * frena la recarga automática por archivos que faltan (utils/fallosDeCarga):
 * recargar a mitad de emitir o de enviar deja el comprobante hecho y sin
 * mandar (reporte de Giacomo, 15-set-2026).
 * @returns {'cargando'|'listo'|'fallo'}
 */
function usePreparacionDelPdf() {
  const [estado, setEstado] = useState('cargando')
  useEffect(() => {
    const soltar = aplazarRecargas()
    let vivo = true
    cargarGeneradorPdf()
      .then(() => { if (vivo) setEstado('listo') })
      .catch(() => { if (vivo) setEstado('fallo') })
    return () => {
      vivo = false
      soltar()
    }
  }, [])
  return estado
}

/**
 * La pestaña corre una versión vieja: falta el archivo que arma el PDF. Se dice
 * ANTES de emitir, con el botón para ponerse al día.
 */
function AvisoVersionVieja() {
  const actualizacion = useActualizacion()
  const [actualizando, setActualizando] = useState(false)
  const actualizar = async () => {
    setActualizando(true)
    if (actualizacion.hay && actualizacion.tipo === 'web') {
      actualizacion.actualizar()
      return
    }
    // Sin una versión esperando, lo mismo que el plan B de ActualizacionContext:
    // soltar el service worker y sus copias, y recargar.
    try {
      const registros = (await navigator.serviceWorker?.getRegistrations?.()) || []
      await Promise.all(registros.map((r) => r.unregister()))
      if (window.caches?.keys) {
        const claves = await caches.keys()
        await Promise.all(claves.map((c) => caches.delete(c)))
      }
    } catch { /* navegador sin service worker */ }
    window.location.reload()
  }
  return (
    <div className="space-y-2">
      <Aviso tono="rojo" titulo="Esta pestaña tiene una versión vieja de Cobrify">
        Falta el archivo que arma el PDF. Actualiza antes de seguir: así no se gasta un número en un
        comprobante que no se podría enviar.
      </Aviso>
      <Boton onClick={actualizar} disabled={actualizando}>
        {actualizando ? 'Actualizando…' : 'Actualizar ahora'}
      </Boton>
    </div>
  )
}

/**
 * Volver a mandar el PDF de un comprobante ya emitido, sin emitir otro: el que
 * no llegó (un envío cortado, la ventana de 24 h cerrada) o el que el cliente
 * pide de nuevo. Queda abierta después de mandar, por si hay más de uno.
 */
export function ModalReenviarComprobante({ conversacion, ficha, onCerrar }) {
  const { user } = useAuth()
  const pdf = usePreparacionDelPdf()
  const [emisor, setEmisor] = useState(null)
  const [lista, setLista] = useState(null) // null mientras se busca
  const [error, setError] = useState('')
  const [elegido, setElegido] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviados, setEnviados] = useState(() => new Set())
  const [falloEnvio, setFalloEnvio] = useState('')
  const ventanaAbierta = msRestantesDeVentana(conversacion) > 0

  useEffect(() => {
    let vivo = true
    Promise.all([
      cargarEmisor(user.uid),
      comprobantesParaReenviar({ uid: user.uid, conversacionId: conversacion.id, documento: ficha?.ruc }),
    ])
      .then(([e, l]) => {
        if (!vivo) return
        setEmisor(e)
        setLista(l)
        // Primero el que todavía no salió por WhatsApp.
        const primero = l.find((c) => sePuedeReenviar(c) && !c.whatsappSentAt) || l.find(sePuedeReenviar)
        if (primero) setElegido(primero.id)
      })
      .catch((err) => {
        if (!vivo) return
        setError(err.message || 'No se pudieron leer los comprobantes')
        setLista([])
      })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, conversacion.id])

  const enviar = async () => {
    if (!elegido || enviando || pdf !== 'listo' || !ventanaAbierta || !emisor) return
    setEnviando(true)
    setFalloEnvio('')
    try {
      const completo = await leerComprobante(user.uid, elegido)
      const idToken = await auth.currentUser.getIdToken()
      await enviarPdfPorWhatsapp({
        uid: user.uid,
        comprobante: completo,
        ajustes: emisor.ajustes,
        conversacionId: conversacion.id,
        idToken,
      })
      setEnviados((s) => new Set(s).add(elegido))
    } catch (err) {
      setFalloEnvio(err.message || 'No se pudo enviar el PDF')
    } finally {
      setEnviando(false)
    }
  }

  const listoParaEnviar = !!elegido && !enviando && pdf === 'listo' && ventanaAbierta && !!emisor && !enviados.has(elegido)

  return (
    <Modal
      titulo="Reenviar comprobante"
      subtitulo={ficha?.nombre || conversacion?.nombre || formatearNumero(conversacion?.waId)}
      ancho="md"
      onClose={enviando ? undefined : onCerrar}
      pie={(
        <>
          <Boton onClick={onCerrar} disabled={enviando}>Cerrar</Boton>
          <Boton variante="primario" onClick={enviar} disabled={!listoParaEnviar}>
            {enviando ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando…</>) : 'Enviar por WhatsApp'}
          </Boton>
        </>
      )}
    >
      <div className="space-y-3">
        {pdf === 'fallo' && <AvisoVersionVieja />}
        {!ventanaAbierta && (
          <Aviso tono="rojo" titulo="La ventana de 24 horas está cerrada">
            WhatsApp no deja mandar archivos hasta que el cliente vuelva a escribir.
          </Aviso>
        )}
        {error && <Aviso tono="rojo" titulo="No se pudieron leer los comprobantes">{error}</Aviso>}
        {falloEnvio && <Aviso tono="rojo" titulo="No se pudo enviar">{falloEnvio}</Aviso>}

        {lista === null ? (
          <p className="flex items-center gap-2 text-[12.5px] text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Buscando sus comprobantes…
          </p>
        ) : lista.length === 0 ? (
          !error && <p className="text-[12.5px] text-gray-500">No hay comprobantes de este cliente.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
            {lista.map((c) => {
              const puede = sePuedeReenviar(c)
              const recien = enviados.has(c.id)
              const estado = recien ? 'Enviado ahora' : c.whatsappSentAt ? 'Ya se envió' : 'No se envió'
              return (
                <li key={c.id}>
                  <label className={`flex items-center gap-3 px-3 py-2.5 ${puede ? 'cursor-pointer hover:bg-gray-50' : 'opacity-60'}`}>
                    <input
                      type="radio"
                      name="comprobante-a-reenviar"
                      value={c.id}
                      checked={elegido === c.id}
                      disabled={!puede || enviando}
                      onChange={() => setElegido(c.id)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-gray-900">
                        {ETIQUETA_TIPO[c.documentType]} {c.number}
                      </span>
                      <span className="block text-[11.5px] text-gray-500">
                        {c.issueDate || c.emissionDate || ''} · {dinero(c.total)}
                        {!puede && ' · SUNAT todavía no la aceptó'}
                      </span>
                    </span>
                    <span className={`text-[11px] ${recien ? 'font-medium text-primary-700' : c.whatsappSentAt ? 'text-gray-400' : 'text-gray-600'}`}>
                      {estado}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
