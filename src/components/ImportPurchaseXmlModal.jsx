import { useState, useRef, useMemo } from 'react'
import { Upload, Loader2, CheckCircle, AlertTriangle, Plus, Search, X, FileText, Link2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatCurrency, buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'
import { readXmlFile, parseInvoiceXml, matchLineToProduct } from '@/services/purchaseXmlImportService'

/**
 * Modal "Importar compra desde XML":
 *   1. El usuario arrastra/elige el XML (o ZIP) de la factura que le emitió su proveedor.
 *   2. Se parsea y se matchea cada línea contra los productos del negocio.
 *   3. Pantalla de revisión: proveedor (existente / se creará) + una fila por línea
 *      con el producto vinculado, cambiable, o "crear nuevo".
 *   4. Confirmar → onConfirm(result) y CreatePurchase llena el formulario.
 *
 * No escribe nada en Firestore: las creaciones ocurren en CreatePurchase.
 */
export default function ImportPurchaseXmlModal({
  isOpen,
  onClose,
  products = [],
  suppliers = [],
  businessRuc = '',
  multiCurrencyOn = false,
  onConfirm,
}) {
  const [step, setStep] = useState('pick') // 'pick' | 'review'
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsed, setParsed] = useState(null)
  // Decisión por línea: { action: 'link'|'create'|'variant', productId, matchedBy, confidence }
  const [lineDecisions, setLineDecisions] = useState([])
  // Índice de línea con el buscador de producto abierto (null = ninguno)
  const [searchingIndex, setSearchingIndex] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  // "No afectar inventario (solo registro)": se traslada al checkbox del
  // formulario de compra. Se pre-marca si TODAS las líneas son servicios
  // (unitCode ZZ del catálogo 03 = servicios).
  const [noStock, setNoStock] = useState(false)

  const productById = useMemo(() => {
    const map = new Map()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  // Índice de búsqueda para el selector manual (mismo patrón que CreatePurchase)
  const searchIndex = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      map.set(p.id, buildSearchHaystack(p.name, p.code, p.sku, p.marca))
    }
    return map
  }, [products])

  const reset = () => {
    setStep('pick')
    setIsParsing(false)
    setParseError('')
    setParsed(null)
    setLineDecisions([])
    setSearchingIndex(null)
    setProductSearch('')
    setIsConfirming(false)
    setDragOver(false)
    setNoStock(false)
  }

  const handleClose = () => {
    if (isConfirming) return
    reset()
    onClose()
  }

  const handleFile = async (file) => {
    if (!file) return
    setIsParsing(true)
    setParseError('')
    try {
      const xmlText = await readXmlFile(file)
      const result = parseInvoiceXml(xmlText)
      if (!result.success) {
        setParseError(result.error)
        return
      }
      const data = result.data
      // Matchear cada línea contra los productos
      const decisions = data.lines.map(line => {
        const match = matchLineToProduct(line, products, data.supplier.ruc)
        if (!match.productId) {
          return { action: 'create', productId: null, matchedBy: null, confidence: 'none' }
        }
        const product = productById.get(match.productId)
        // Producto con variantes: no podemos elegir la variante automáticamente.
        // Se deja "pendiente": se llena la descripción y el usuario elige la
        // variante en el formulario (el flujo normal abre el modal de variantes).
        if (product?.hasVariants && product?.variants?.length > 0) {
          return { action: 'variant', productId: match.productId, matchedBy: match.matchedBy, confidence: match.confidence }
        }
        return { action: 'link', productId: match.productId, matchedBy: match.matchedBy, confidence: match.confidence }
      })
      setParsed(data)
      setLineDecisions(decisions)
      // Factura de puros servicios (todas las líneas en unidad ZZ) →
      // sugerir "solo registro" (el usuario puede desmarcarla).
      setNoStock(data.lines.length > 0 && data.lines.every(l => l.unitCode === 'ZZ'))
      setStep('review')
    } catch (error) {
      console.error('Error al leer XML:', error)
      setParseError(error.message || 'No se pudo leer el archivo')
    } finally {
      setIsParsing(false)
    }
  }

  const setDecision = (index, decision) => {
    setLineDecisions(prev => prev.map((d, i) => (i === index ? decision : d)))
    setSearchingIndex(null)
    setProductSearch('')
  }

  const pickProduct = (index, product) => {
    if (product.hasVariants && product.variants?.length > 0) {
      setDecision(index, { action: 'variant', productId: product.id, matchedBy: 'manual', confidence: 'exact' })
    } else {
      setDecision(index, { action: 'link', productId: product.id, matchedBy: 'manual', confidence: 'exact' })
    }
  }

  // Proveedor: ¿existe ya por RUC?
  const existingSupplier = useMemo(() => {
    if (!parsed?.supplier?.ruc) return null
    return suppliers.find(s => (s.ruc || s.documentNumber) === parsed.supplier.ruc) || null
  }, [parsed, suppliers])

  // Avisos
  const rucMismatch = parsed && businessRuc && parsed.customer?.ruc && parsed.customer.ruc !== businessRuc
  const usdBlocked = parsed && parsed.currency === 'USD' && !multiCurrencyOn
  // Total calculado desde las líneas vs total del XML (descuentos globales, ICBPER, etc.)
  const computedTotal = useMemo(() => {
    if (!parsed) return 0
    return parsed.lines.reduce((s, l) => s + l.cost * l.quantity, 0)
  }, [parsed])
  const totalMismatch = parsed && Math.abs(computedTotal - parsed.payableAmount) > 0.5

  const counts = useMemo(() => {
    let linked = 0, created = 0, variants = 0
    for (const d of lineDecisions) {
      if (d.action === 'link') linked++
      else if (d.action === 'variant') variants++
      else created++
    }
    return { linked, created, variants }
  }, [lineDecisions])

  const handleConfirm = async () => {
    if (!parsed || isConfirming) return
    setIsConfirming(true)
    try {
      await onConfirm({
        parsed,
        existingSupplier,
        decisions: lineDecisions,
        noStock,
      })
      reset()
    } catch (error) {
      console.error('Error al importar compra desde XML:', error)
      setIsConfirming(false)
    }
  }

  const filteredForSearch = useMemo(() => {
    if (searchingIndex === null) return []
    const term = productSearch.trim()
    const list = []
    for (const p of products) {
      if (term && !matchesPrebuilt(searchIndex.get(p.id) || '', term)) continue
      list.push(p)
      if (list.length >= 20) break
    }
    return list
  }, [searchingIndex, productSearch, products, searchIndex])

  const renderDecisionCell = (index) => {
    const d = lineDecisions[index]
    if (!d) return null
    const product = d.productId ? productById.get(d.productId) : null

    if (searchingIndex === index) {
      return (
        <div className="relative">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={() => { setSearchingIndex(null); setProductSearch('') }}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            <button
              onClick={() => setDecision(index, { action: 'create', productId: null, matchedBy: null, confidence: 'none' })}
              className="w-full text-left px-3 py-2 text-sm text-primary-600 font-medium hover:bg-primary-50 border-b border-gray-100 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Crear producto nuevo
            </button>
            {filteredForSearch.map(p => (
              <button
                key={p.id}
                onClick={() => pickProduct(index, p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              >
                <span className="font-medium text-gray-900">{p.name}</span>
                {(p.code || p.sku) && (
                  <span className="text-xs text-gray-400 ml-2">{p.code || p.sku}</span>
                )}
              </button>
            ))}
            {filteredForSearch.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">Sin resultados</div>
            )}
          </div>
        </div>
      )
    }

    if (d.action === 'create') {
      return (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-blue-700">
            <Plus className="w-4 h-4 flex-shrink-0" />
            Se creará como producto nuevo
          </span>
          <button
            onClick={() => { setSearchingIndex(index); setProductSearch('') }}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 flex-shrink-0"
          >
            Vincular existente
          </button>
        </div>
      )
    }

    if (d.action === 'variant') {
      return (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 min-w-0">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{product?.name} — elegir variante en el formulario</span>
          </span>
          <button
            onClick={() => { setSearchingIndex(index); setProductSearch('') }}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 flex-shrink-0"
          >
            Cambiar
          </button>
        </div>
      )
    }

    // link
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm min-w-0">
          {d.confidence === 'suggested' ? (
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          )}
          <span className="truncate font-medium text-gray-900">{product?.name || '(producto eliminado)'}</span>
          {d.matchedBy && (
            <Badge variant={d.confidence === 'suggested' ? 'warning' : 'success'} className="text-xs flex-shrink-0">
              {d.confidence === 'suggested' ? `¿${d.matchedBy}?` : d.matchedBy}
            </Badge>
          )}
        </span>
        <button
          onClick={() => { setSearchingIndex(index); setProductSearch('') }}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 flex-shrink-0"
        >
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar compra desde XML"
      size={step === 'review' ? 'xl' : 'md'}
    >
      {step === 'pick' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Sube el XML de la factura o boleta que te emitió tu proveedor (o el ZIP que lo contiene).
            Se llenará la compra automáticamente: proveedor, número, fecha, forma de pago y productos.
          </p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              handleFile(e.dataTransfer.files?.[0])
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
            }`}
          >
            {isParsing ? (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Leyendo XML...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Upload className="w-8 h-8" />
                <span className="text-sm font-medium text-gray-700">Arrastra el archivo aquí o haz clic para elegirlo</span>
                <span className="text-xs">.xml o .zip</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.zip"
            className="hidden"
            onChange={e => {
              handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {parseError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}
        </div>
      )}

      {step === 'review' && parsed && (
        <div className="space-y-4">
          {/* Cabecera del documento */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg text-sm">
            <div className="col-span-2">
              <p className="text-xs text-gray-500">Proveedor</p>
              <p className="font-medium text-gray-900 truncate">{parsed.supplier.name}</p>
              <p className="text-xs text-gray-500">
                RUC {parsed.supplier.ruc}{' '}
                {existingSupplier ? (
                  <Badge variant="success" className="text-xs ml-1">Existente</Badge>
                ) : (
                  <Badge variant="info" className="text-xs ml-1">Se creará</Badge>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Documento</p>
              <p className="font-medium text-gray-900 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                {parsed.fullNumber}
              </p>
              <p className="text-xs text-gray-500">{parsed.docType === 'boleta' ? 'Boleta' : 'Factura'} · {parsed.issueDate}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pago · Total</p>
              <p className="font-medium text-gray-900">
                {parsed.paymentType === 'credito'
                  ? `Crédito${parsed.dueDate ? ` (vence ${parsed.dueDate})` : ''}`
                  : 'Contado'}
              </p>
              <p className="text-xs text-gray-600 font-semibold">
                {formatCurrency(parsed.payableAmount, parsed.currency)} {parsed.currency}
              </p>
            </div>
          </div>

          {/* Avisos */}
          {rucMismatch && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Esta factura fue emitida a <strong>{parsed.customer.name}</strong> (RUC {parsed.customer.ruc}),
                que no coincide con el RUC de tu negocio. Verifica que sea una compra tuya antes de continuar.
              </span>
            </div>
          )}
          {usdBlocked && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Esta factura está en dólares (USD) y tu negocio no tiene activada la opción de
                multi-divisa en Configuración. Actívala para importar compras en USD.
              </span>
            </div>
          )}
          {parsed.detraction && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Operación sujeta a <strong>detracción</strong> ({parsed.detraction.percent}% ={' '}
                {formatCurrency(parsed.detraction.amount, parsed.currency)}
                {parsed.detraction.account ? ` · Cta. BN ${parsed.detraction.account}` : ''}).
                El depósito al Banco de la Nación se gestiona por separado.
              </span>
            </div>
          )}
          {totalMismatch && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                El total calculado desde las líneas ({formatCurrency(computedTotal, parsed.currency)}) no coincide
                con el total del XML ({formatCurrency(parsed.payableAmount, parsed.currency)}). Puede haber un
                descuento/cargo global o ICBPER. Revisa los costos antes de guardar.
              </span>
            </div>
          )}

          {/* Líneas */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2 w-8">#</th>
                  <th className="px-3 py-2">Descripción del proveedor</th>
                  <th className="px-3 py-2 text-right w-20">Cant.</th>
                  <th className="px-3 py-2 text-right w-28">Costo unit.</th>
                  <th className="px-3 py-2 w-[40%]">Producto en tu sistema</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {parsed.lines.map((line, idx) => (
                  <tr key={idx} className="align-top">
                    <td className="px-3 py-2.5 text-gray-400">{line.lineNumber}</td>
                    <td className="px-3 py-2.5">
                      <p className="text-gray-900">{line.description}</p>
                      <p className="text-xs text-gray-400">
                        {line.sellerCode && <span>Cód. prov.: {line.sellerCode} · </span>}
                        {line.unitCode}
                        {line.isFree && <span> · Bonificación</span>}
                        {line.taxAffectation !== '10' && (
                          <span> · {line.taxAffectation === '20' ? 'Exonerado' : 'Inafecto'}</span>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-900">{line.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-gray-900">
                      {formatCurrency(line.cost, parsed.currency)}
                    </td>
                    <td className="px-3 py-2.5">{renderDecisionCell(idx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Solo registro: mismo checkbox que el formulario de compra */}
          <label className={`flex items-start gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
            noStock ? 'border-amber-300 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'
          }`}>
            <input
              type="checkbox"
              checked={noStock}
              onChange={e => setNoStock(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">No afectar inventario (solo registro)</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                La compra se guarda para tu control pero no suma stock ni cambia costos.
                {noStock && parsed.lines.every(l => l.unitCode === 'ZZ') && ' Se marcó sola porque todas las líneas son servicios.'}
              </span>
            </span>
          </label>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
            <p className="text-sm text-gray-600 flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-gray-400" />
              {counts.linked} vinculado{counts.linked !== 1 ? 's' : ''} · {counts.created} nuevo{counts.created !== 1 ? 's' : ''}
              {counts.variants > 0 && ` · ${counts.variants} con variantes por elegir`}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleClose} disabled={isConfirming}>
                Cancelar
              </Button>
              <Button onClick={handleConfirm} disabled={isConfirming || usdBlocked}>
                {isConfirming ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  'Importar compra'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
