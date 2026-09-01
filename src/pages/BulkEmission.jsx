/**
 * EMISIÓN MASIVA: crear muchos documentos de una vez desde un Excel.
 *
 * Dos pestañas, dos circuitos:
 *  - COMPROBANTES: plantilla + vista previa validada. El motor de emisión de
 *    comprobantes es la fase siguiente (toca stock, caja y numeración de
 *    ventas); mientras tanto la pestaña valida el archivo y lo deja listo.
 *  - GRE TRANSPORTISTA (adelantada por pedido urgente): circuito COMPLETO —
 *    plantilla, vista previa y EMISIÓN del lote en serie con ritmo, usando la
 *    misma creación (numeración atómica) y la misma Cloud Function del botón
 *    individual de GRE Transportista.
 */
import { useState, useRef } from 'react'
import { filtrarVendibles } from '@/utils/productSale'
import {
  FileSpreadsheet, Upload, Download, Loader2, CheckCircle, XCircle,
  AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Truck, Receipt, Send,
  StopCircle,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import GuideLink from '@/components/guide/GuideLink'
import { formatCurrency } from '@/lib/utils'

const ETIQUETA_ESTADO = {
  // GRE (femenino: la guía)
  aceptada: { texto: 'Aceptada', variant: 'success' },
  rechazada: { texto: 'Rechazada', variant: 'danger' },
  error_envio: { texto: 'Creada, sin enviar', variant: 'warning' },
  error_creacion: { texto: 'No se creó', variant: 'danger' },
  omitida: { texto: 'Ya emitida antes', variant: 'default' },
  cancelada: { texto: 'Cancelada', variant: 'default' },
  // Comprobantes (masculino: el comprobante)
  aceptado: { texto: 'Aceptado', variant: 'success' },
  rechazado: { texto: 'Rechazado', variant: 'danger' },
  creado: { texto: 'Creado, sin enviar', variant: 'warning' },
  omitido: { texto: 'Ya emitido antes', variant: 'default' },
  cancelado: { texto: 'Cancelado', variant: 'default' },
}

export default function BulkEmission() {
  const { getBusinessId, isDemoMode, businessSettings, user, branchScope } = useAppContext()
  // La sucursal sale del selector del HEADER, igual que en el resto del
  // sistema. Sin esto la emisión solo miraba las series GLOBALES y un negocio
  // con series por sucursal fallaba con "Series no configuradas".
  const branchIdActivo = (branchScope && branchScope !== 'all' && branchScope !== 'main') ? branchScope : null
  const toast = useToast()
  const inputRef = useRef(null)
  const cancelarRef = useRef(false)

  const [tipo, setTipo] = useState('comprobantes') // 'comprobantes' | 'gre'
  const [descargando, setDescargando] = useState(false)
  const [analizando, setAnalizando] = useState(false)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [resultado, setResultado] = useState(null)
  const [abiertas, setAbiertas] = useState(() => new Set())

  // Emisión del lote (solo GRE Transportista por ahora)
  const [emitiendo, setEmitiendo] = useState(false)
  const [progreso, setProgreso] = useState(null)
  const [emision, setEmision] = useState(null) // { resultados, resumen }

  const igvCrudo = businessSettings?.emissionConfig?.taxConfig?.igvRate
  const igvRate = igvCrudo === 10 ? 10.5 : (igvCrudo ?? 18)

  const cambiarTipo = (nuevo) => {
    if (emitiendo) return
    setTipo(nuevo)
    setResultado(null)
    setEmision(null)
    setProgreso(null)
    setNombreArchivo('')
    setAbiertas(new Set())
  }

  const handleDescargarPlantilla = async () => {
    setDescargando(true)
    try {
      if (tipo === 'gre') {
        const { descargarPlantillaGreTransportista } = await import('@/services/bulkCarrierGuideTemplateService')
        await descargarPlantillaGreTransportista()
      } else {
        const { descargarPlantillaComprobantes } = await import('@/services/bulkEmissionTemplateService')
        await descargarPlantillaComprobantes()
      }
    } catch (error) {
      console.error('Error al generar la plantilla:', error)
      toast.error('No se pudo generar la plantilla')
    } finally {
      setDescargando(false)
    }
  }

  const handleArchivo = async (e) => {
    const archivo = e.target.files?.[0]
    // Permitir volver a elegir el MISMO archivo corregido: sin esto, onChange
    // no dispara con el mismo nombre.
    e.target.value = ''
    if (!archivo) return
    if (isDemoMode) {
      toast.error('No disponible en modo demo')
      return
    }

    setAnalizando(true)
    setNombreArchivo(archivo.name)
    setResultado(null)
    setEmision(null)
    setProgreso(null)
    setAbiertas(new Set())
    try {
      const buffer = await archivo.arrayBuffer()
      let res
      if (tipo === 'gre') {
        const { parsearExcelGreTransportista } = await import('@/services/bulkCarrierGuideParserService')
        res = await parsearExcelGreTransportista(buffer)
      } else {
        // El catálogo hace falta para cruzar códigos; los vendedores, para
        // resolver la columna VENDEDOR. Van en paralelo: son dos lecturas
        // independientes y el usuario está esperando la vista previa.
        const [{ getProducts }, { getSellers }] = await Promise.all([
          import('@/services/firestoreService'),
          import('@/services/sellerService'),
        ])
        const [prodRes, sellersRes] = await Promise.all([
          getProducts(getBusinessId()),
          getSellers(getBusinessId()),
        ])
        const { parsearExcelComprobantes } = await import('@/services/bulkEmissionParserService')
        res = await parsearExcelComprobantes(buffer, {
          // El Excel cruza por codigo contra lo VENDIBLE: si un material de
          // uso interno entra en un lote, es un error del archivo.
          products: prodRes.success ? filtrarVendibles(prodRes.data) : [],
          sellers: sellersRes.success ? sellersRes.data : [],
          // Cuenta del Banco de la Nación de Ajustes: es el respaldo cuando el
          // Excel no trae una propia.
          cuentaDetraccion: (businessSettings?.bankAccountsList || [])
            .find((c) => c?.accountType === 'detracciones')?.accountNumber || '',
          igvRate,
        })
      }

      if (!res.success) {
        toast.error(res.error)
        setNombreArchivo('')
        return
      }
      setResultado(res)
      // Las operaciones con errores llegan ABIERTAS: son lo que hay que leer.
      setAbiertas(new Set(res.operaciones.filter((o) => o.errores.length > 0).map((o) => o.nOperacion)))
      if (res.resumen.conErrores === 0 && res.errores.length === 0) {
        toast.success(`${res.resumen.operaciones} ${tipo === 'gre' ? 'guías leídas, todas válidas' : 'operaciones leídas, todas válidas'}`)
      } else {
        toast.warning(`${res.resumen.conErrores} de ${res.resumen.operaciones} con errores`)
      }
    } catch (error) {
      console.error('Error al analizar el archivo:', error)
      toast.error('No se pudo leer el archivo. ¿Es el Excel de la plantilla correcta?')
      setNombreArchivo('')
    } finally {
      setAnalizando(false)
    }
  }

  const handleEmitirLote = async () => {
    if (!resultado) return
    const listas = resultado.operaciones.filter((o) => o.errores.length === 0)
    if (listas.length === 0) return
    if (isDemoMode) {
      toast.error('No disponible en modo demo')
      return
    }

    // Confirmación explícita: esto emite documentos reales ante SUNAT. En
    // comprobantes se avisa además del stock, que es lo que no se puede
    // deshacer con un clic.
    const ok = window.confirm(
      tipo === 'gre'
        ? `Se van a emitir ${listas.length} guías de remisión transportista ante SUNAT, una por una. `
          + 'Las operaciones con errores no se tocan. ¿Continuar?'
        : `Se van a emitir ${listas.length} comprobantes ante SUNAT, uno por uno, por `
          + `${formatCurrency(resultado.resumen.totalEmitible)}. Se descontará el stock igual que en una `
          + 'venta del Punto de Venta. Las operaciones con errores no se tocan. ¿Continuar?'
    )
    if (!ok) return

    cancelarRef.current = false
    setEmitiendo(true)
    setEmision(null)
    setProgreso({ indice: 0, total: listas.length, etapa: 'iniciando' })
    try {
      let res
      if (tipo === 'gre') {
        const { emitirLoteGreTransportista, huellaDelLote } = await import('@/services/bulkCarrierGuideEmitterService')
        res = await emitirLoteGreTransportista(getBusinessId(), listas, {
          loteKey: huellaDelLote(nombreArchivo, listas),
          mtcRegistration: businessSettings?.mtcRegistration || '',
          onProgress: (p) => setProgreso(p),
          debeCancelar: () => cancelarRef.current,
        })
      } else {
        const { emitirLoteComprobantes, huellaDelLote } = await import('@/services/bulkInvoiceEmitterService')
        res = await emitirLoteComprobantes(getBusinessId(), listas, {
          loteKey: huellaDelLote(nombreArchivo, listas),
          igvRate,
          branchId: branchIdActivo,
          allowNegativeStock: businessSettings?.allowNegativeStock === true,
          autoEnvio: businessSettings?.autoSendToSunat === true,
          userId: user?.uid || '',
          onProgress: (p) => setProgreso(p),
          debeCancelar: () => cancelarRef.current,
        })
      }
      setEmision(res)

      // Los dos motores nombran distinto por el género del documento.
      const aceptados = res.resumen.aceptadas ?? res.resumen.aceptados ?? 0
      const rechazados = res.resumen.rechazadas ?? res.resumen.rechazados ?? 0
      const conError = res.resumen.conError ?? (res.resumen.erroresEnvio + res.resumen.erroresCreacion)
      const nombre = tipo === 'gre' ? 'guías' : 'comprobantes'

      if (res.resumen.creados > 0 && aceptados === 0) {
        toast.success(`${res.resumen.creados} ${nombre} creados. No se enviaron a SUNAT porque tienes apagado el envío automático — puedes enviarlos desde Ventas.`, 9000)
      } else if (aceptados === res.resumen.total) {
        toast.success(`Lote completo: ${aceptados} ${nombre} aceptados por SUNAT`)
      } else {
        toast.warning(`Lote terminado: ${aceptados} aceptados, ${rechazados} rechazados, ${conError} con error`)
      }
      if (res.resumen.sinStock > 0) {
        toast.warning(`${res.resumen.sinStock} comprobante(s) se emitieron pero su stock no se pudo descontar. Revísalos en Inventario.`, 8000)
      }
    } catch (error) {
      console.error('Error al emitir el lote:', error)
      toast.error(tipo === 'gre'
        ? 'El lote se interrumpió. Revisa GRE Transportista: las guías ya creadas NO se duplican al reintentar.'
        : 'El lote se interrumpió. Revisa Ventas: los comprobantes ya emitidos NO se duplican al reintentar con el mismo archivo.')
    } finally {
      setEmitiendo(false)
      setProgreso(null)
    }
  }

  const toggleOperacion = (nOp) => {
    setAbiertas((prev) => {
      const s = new Set(prev)
      if (s.has(nOp)) s.delete(nOp)
      else s.add(nOp)
      return s
    })
  }

  const monedaDe = (op) => (op.moneda === 'USD' ? 'USD' : 'PEN')
  const erroresGlobales = resultado
    ? resultado.errores.filter((e) => !resultado.operaciones.some((o) => o.errores.includes(e)))
    : []
  const resultadoDe = (nOp) => emision?.resultados.find((r) => r.nOperacion === nOp)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Emisión Masiva</h1>
          <GuideLink />
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Crea muchos documentos de una vez desde un archivo de Excel
        </p>
      </div>

      {/* Selector de tipo de documento */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cambiarTipo('comprobantes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            tipo === 'comprobantes'
              ? 'bg-primary-600 text-white border-primary-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Comprobantes
        </button>
        <button
          type="button"
          onClick={() => cambiarTipo('gre')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            tipo === 'gre'
              ? 'bg-primary-600 text-white border-primary-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Truck className="w-4 h-4" />
          GRE Transportista
        </button>
      </div>

      {/* Paso 1 y 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold shrink-0">1</span>
              <h2 className="font-semibold text-gray-900">Descarga la plantilla</h2>
            </div>
            <p className="text-sm text-gray-600">
              {tipo === 'gre'
                ? 'Una fila por carga; la columna N° OPERACIÓN agrupa las filas de una misma guía. Los ubigeos se escriben con nombres (LIMA/LIMA/SURQUILLO) y la serie la pone el sistema.'
                : 'Una fila por producto o servicio; la columna N° OPERACIÓN agrupa las filas de un mismo comprobante. La serie y el número los pone el sistema.'}
            </p>
            <Button variant="outline" onClick={handleDescargarPlantilla} disabled={descargando || emitiendo}>
              {descargando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Descargar plantilla
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold shrink-0">2</span>
              <h2 className="font-semibold text-gray-900">Sube el archivo llenado</h2>
            </div>
            <p className="text-sm text-gray-600">
              El sistema valida todo y te muestra la vista previa con los errores por fila.
              {tipo === 'gre' ? ' Emites recién cuando confirmas.' : ' Nada se emite en este paso.'}
            </p>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleArchivo} />
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => inputRef.current?.click()} disabled={analizando || emitiendo}>
                {analizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {resultado ? 'Subir de nuevo' : 'Subir Excel'}
              </Button>
              {nombreArchivo && !analizando && (
                <span className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{nombreArchivo}</span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vista previa */}
      {resultado && (
        <>
          {/* Resumen del lote */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">{tipo === 'gre' ? 'Guías' : 'Operaciones'}</p>
                <p className="text-2xl font-bold text-gray-900">{resultado.resumen.operaciones}</p>
                <p className="text-xs text-gray-500">{resultado.resumen.items} {tipo === 'gre' ? 'cargas' : 'ítems'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Listas para emitir</p>
                <p className="text-2xl font-bold text-green-600">{resultado.resumen.listas}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Con errores</p>
                <p className={`text-2xl font-bold ${resultado.resumen.conErrores > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {resultado.resumen.conErrores}
                </p>
              </CardContent>
            </Card>
            {tipo === 'comprobantes' && !emision ? (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Total emitible</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(resultado.resumen.totalEmitible)}</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Emitidos en este lote</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {emision ? (emision.resumen.aceptadas ?? emision.resumen.aceptados ?? 0) : '—'}
                  </p>
                  {emision && (() => {
                    const r = emision.resumen
                    const problemas = (r.rechazadas ?? r.rechazados ?? 0)
                      + (r.conError ?? ((r.erroresEnvio || 0) + (r.erroresCreacion || 0)))
                    return problemas > 0
                      ? <p className="text-xs text-red-600">{problemas} con problema</p>
                      : null
                  })()}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Errores de archivo (sin operación) */}
          {erroresGlobales.length > 0 && (
            <Card className="border-red-200">
              <CardContent className="p-4 space-y-1.5">
                {erroresGlobales.map((e, i) => (
                  <p key={i} className="text-sm text-red-700 flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span><strong>Fila {e.fila}:</strong> {e.mensaje}</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Barra de emisión */}
          {(emitiendo || emision) && (
            <Card className="border-primary-200">
              <CardContent className="p-4 space-y-2">
                {emitiendo && progreso ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                        Emitiendo {tipo === 'gre' ? 'guía' : 'comprobante'} {Math.min(progreso.indice + 1, progreso.total)} de {progreso.total}
                        {progreso.numero ? ` — ${progreso.numero}` : ''}
                      </p>
                      <Button variant="outline" size="sm" onClick={() => { cancelarRef.current = true }}>
                        <StopCircle className="w-4 h-4 mr-1" />
                        Detener
                      </Button>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-primary-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.round(((progreso.indice) / Math.max(progreso.total, 1)) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      El lote va {tipo === 'gre' ? 'guía por guía' : 'uno por uno'}, con pausa entre envíos. Si lo detienes,
                      lo ya emitido queda emitido y al volver a subir el mismo archivo no se duplica nada.
                    </p>
                  </>
                ) : emision && (() => {
                    // Los dos motores nombran distinto según el género del documento.
                    const r = emision.resumen
                    const aceptados = r.aceptadas ?? r.aceptados ?? 0
                    const rechazados = r.rechazadas ?? r.rechazados ?? 0
                    const conError = r.conError ?? ((r.erroresEnvio || 0) + (r.erroresCreacion || 0))
                    const omitidos = r.omitidas ?? r.omitidos ?? 0
                    const cancelados = r.canceladas ?? r.cancelados ?? 0
                    const g = tipo === 'gre'
                    return (
                      <p className="text-sm text-gray-900">
                        <strong>Lote terminado:</strong> {aceptados} {g ? 'aceptadas' : 'aceptados'}
                        {rechazados > 0 && `, ${rechazados} ${g ? 'rechazadas' : 'rechazados'}`}
                        {conError > 0 && `, ${conError} con error`}
                        {omitidos > 0 && `, ${omitidos} ${g ? 'omitidas' : 'omitidos'} (ya se habían emitido)`}
                        {cancelados > 0 && `, ${cancelados} ${g ? 'canceladas' : 'cancelados'}`}.
                        {' '}El detalle está en cada operación de la lista de abajo y en{' '}
                        {g ? 'la pantalla GRE Transportista' : 'Ventas'}.
                      </p>
                    )
                })()}
              </CardContent>
            </Card>
          )}

          {/* Operaciones */}
          <div className="space-y-2">
            {resultado.operaciones.map((op) => {
              const conError = op.errores.length > 0
              const abierta = abiertas.has(op.nOperacion)
              const rEmision = resultadoDe(op.nOperacion)
              const etiqueta = rEmision ? ETIQUETA_ESTADO[rEmision.estado] : null
              return (
                <Card key={op.nOperacion} className={conError ? 'border-red-200' : ''}>
                  <button
                    type="button"
                    onClick={() => toggleOperacion(op.nOperacion)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                  >
                    {conError
                      ? <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                      : <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      {tipo === 'gre' ? (
                        <>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            Guía {op.nOperacion} · {op.resumen.remitente || 'Sin remitente'} → {op.resumen.destinatario || 'Sin destinatario'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {op.resumen.ruta} · {op.resumen.placa || 'sin placa'} · {op.resumen.cargas} {op.resumen.cargas === 1 ? 'carga' : 'cargas'} · {op.resumen.peso} kg
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            Op. {op.nOperacion} · {op.tipo === 'factura' ? 'Factura' : 'Boleta'} · {op.cliente.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {op.items.length} {op.items.length === 1 ? 'ítem' : 'ítems'}
                            {' · '}{op.formaPago === 'credito' ? 'Crédito' : 'Contado'}
                            {op.cuotas?.length > 1 && ` en ${op.cuotas.length} cuotas`}
                            {op.detraccion && ` · Detracción ${op.detraccion.rate}%`}
                            {op.vendedor && ` · ${op.vendedor.name}`}
                            {op.advertencias.length > 0 && ` · ${op.advertencias.length} aviso${op.advertencias.length === 1 ? '' : 's'}`}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      {etiqueta && <Badge variant={etiqueta.variant}>{rEmision.numero ? `${rEmision.numero} · ` : ''}{etiqueta.texto}</Badge>}
                      {tipo === 'comprobantes' && (
                        <div>
                          <p className="text-sm font-bold text-gray-900">{formatCurrency(op.totales.total, monedaDe(op))}</p>
                          {op.totales.netoAPagar != null ? (
                            <p className="text-xs text-gray-500">Paga {formatCurrency(op.totales.netoAPagar, monedaDe(op))} · deposita S/ {op.totales.detraccionMonto}</p>
                          ) : (
                            op.totales.igv > 0 && <p className="text-xs text-gray-500">IGV {formatCurrency(op.totales.igv, monedaDe(op))}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {abierta ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  </button>

                  {abierta && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                      {(op.errores.length > 0 || op.advertencias.length > 0 || rEmision) && (
                        <div className="space-y-1.5">
                          {rEmision && (
                            <p className={`text-sm flex items-start gap-2 ${(rEmision.estado === 'aceptada' || rEmision.estado === 'aceptado') ? 'text-green-700' : 'text-gray-700'}`}>
                              <Send className="w-4 h-4 mt-0.5 shrink-0" />
                              <span><strong>{rEmision.numero || 'Sin número'}:</strong> {rEmision.mensaje}</span>
                            </p>
                          )}
                          {op.errores.map((e, i) => (
                            <p key={`e${i}`} className="text-sm text-red-700 flex items-start gap-2">
                              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                              <span><strong>Fila {e.fila}{e.columna ? ` · ${e.columna}` : ''}:</strong> {e.mensaje}</span>
                            </p>
                          ))}
                          {op.advertencias.map((a, i) => (
                            <p key={`a${i}`} className="text-sm text-amber-700 flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                              <span><strong>Fila {a.fila}{a.columna ? ` · ${a.columna}` : ''}:</strong> {a.mensaje}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                              <th className="py-1.5 pr-3 font-medium">Descripción</th>
                              <th className="py-1.5 pr-3 font-medium text-right">Cant.</th>
                              {tipo === 'comprobantes' && <th className="py-1.5 pr-3 font-medium text-right">P. unit.</th>}
                              <th className="py-1.5 pr-3 font-medium">{tipo === 'gre' ? 'Unidad' : 'Detalle'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {op.items.map((it, i) => (
                              <tr key={i} className="border-b border-gray-50 last:border-0">
                                <td className="py-1.5 pr-3 text-gray-900">{tipo === 'gre' ? it.description : it.descripcion}</td>
                                <td className="py-1.5 pr-3 text-right text-gray-700">{tipo === 'gre' ? it.quantity : it.cantidad}</td>
                                {tipo === 'comprobantes' && (
                                  <td className="py-1.5 pr-3 text-right text-gray-700">{formatCurrency(it.precioUnitario, monedaDe(op))}</td>
                                )}
                                <td className="py-1.5 pr-3">
                                  {tipo === 'gre' ? (
                                    <span className="text-xs text-gray-600">{it.unit}</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                                      {it.isBonificacion && <Badge variant="warning">Bonificación</Badge>}
                                      {it.productId
                                        ? <Badge variant="success">Descuenta stock</Badge>
                                        : it.codigo
                                          ? <Badge variant="default">Sin cruce de stock</Badge>
                                          : null}
                                      {it.descuentoItem > 0 && (
                                        <span className="text-xs text-gray-500">Dscto. {formatCurrency(it.descuentoItem, monedaDe(op))}</span>
                                      )}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Cuotas y detracción: se revisan ANTES de emitir, no
                          después de que SUNAT las rechace. */}
                      {tipo === 'comprobantes' && op.cuotas?.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span className="font-medium text-gray-700">Cuotas:</span>
                          {op.cuotas.map((c) => (
                            <span key={c.number}>
                              {c.number}) {new Date(c.dueDate).toLocaleDateString('es-PE')} · {formatCurrency(c.amount, monedaDe(op))}
                            </span>
                          ))}
                        </div>
                      )}
                      {tipo === 'comprobantes' && op.detraccion && (
                        <p className="text-xs text-gray-600">
                          <span className="font-medium text-gray-700">Detracción:</span>{' '}
                          {op.detraccion.code} · {op.detraccion.name} ({op.detraccion.rate}%)
                          {op.detraccion.bankAccount && ` · Cta. ${op.detraccion.bankAccount}`}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {/* Cierre: qué hacer ahora */}
          <Card>
            <CardContent className="p-4">
              {resultado.resumen.conErrores > 0 || erroresGlobales.length > 0 ? (
                <p className="text-sm text-gray-700 flex items-start gap-2">
                  <RefreshCw className="w-4 h-4 mt-0.5 text-primary-600 shrink-0" />
                  Corrige los errores en tu archivo de Excel (las filas están indicadas arriba) y vuelve a
                  subirlo con <strong>Subir de nuevo</strong>.
                  {tipo === 'gre' && resultado.resumen.listas > 0 && (
                    <> También puedes emitir ya las {resultado.resumen.listas} guías válidas: las que tienen
                    errores no se tocan.</>
                  )}
                </p>
              ) : tipo === 'gre' ? (
                <p className="text-sm text-gray-700 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
                  Tu archivo está válido: {resultado.resumen.listas} guías listas para emitir.
                </p>
              ) : (
                <p className="text-sm text-gray-700 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
                  Tu archivo está válido: {resultado.resumen.listas} operaciones listas por{' '}
                  <strong>{formatCurrency(resultado.resumen.totalEmitible)}</strong>. Al emitir se descontará
                  el stock igual que en una venta del Punto de Venta.
                </p>
              )}
              {resultado.resumen.listas > 0 && !emitiendo && !emision && (
                <div className="mt-3">
                  <Button onClick={handleEmitirLote}>
                    <Send className="w-4 h-4 mr-2" />
                    {tipo === 'gre'
                      ? `Emitir ${resultado.resumen.listas} ${resultado.resumen.listas === 1 ? 'guía' : 'guías'} a SUNAT`
                      : `Emitir ${resultado.resumen.listas} ${resultado.resumen.listas === 1 ? 'comprobante' : 'comprobantes'} a SUNAT`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
