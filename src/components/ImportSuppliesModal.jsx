/**
 * IMPORTAR EL PADRÓN DE SUMINISTROS.
 *
 * Lee el Excel con el que el negocio venía llevando la cobranza, tal como
 * está: dos hojas (con medidor y de cuota fija), títulos arriba, filas de
 * totales al final. La lógica de lectura vive en `utils/importarSuministros.js`
 * para poder probarla sin navegador; acá está solo la pantalla.
 *
 * Antes de importar se muestra qué se entendió y qué quedó observado, porque
 * el padrón real trae datos incompletos —suministros sin número, un número
 * repetido en dos personas, medidores sin lectura— y el negocio tiene derecho
 * a verlos antes de que entren, no después.
 */
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertTriangle, Gauge, Coins } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { createSuppliesBulk } from '@/services/serviceBillingService'
import { leerLibro, textoDelAviso } from '@/utils/importarSuministros'
import { CON_MEDIDOR } from '@/utils/cobranzaServicios'

export default function ImportSuppliesModal({ isOpen, onClose, onImported, direccionPorDefecto = '' }) {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [leido, setLeido] = useState(null)
  const [archivo, setArchivo] = useState('')
  const [direccion, setDireccion] = useState(direccionPorDefecto)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState(null)

  const limpiar = () => { setLeido(null); setArchivo(''); setResultado(null) }
  const cerrar = () => { limpiar(); onClose() }

  const elegirArchivo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivo(file.name)
    setResultado(null)

    const lector = new FileReader()
    lector.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        // `header: 1` devuelve la matriz cruda: los encabezados de esta hoja no
        // están en la primera fila, así que no se puede dejar que la librería
        // los adivine.
        const hojas = wb.SheetNames.map(nombre => ({
          nombre,
          filas: XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '', raw: true }),
        }))
        const r = leerLibro(hojas, { direccion })
        setLeido(r)
        if (r.resumen.total === 0) {
          toast.error('No se encontraron suministros. Revisa que la hoja tenga una columna con el nombre del usuario.')
        }
      } catch (err) {
        console.error('Error al leer el Excel:', err)
        toast.error('No se pudo leer el archivo. Verifica que sea un Excel válido.')
      }
    }
    lector.readAsArrayBuffer(file)
  }

  // Cambiar la dirección después de leer el archivo no obliga a volver a
  // cargarlo: se le pone a todos en el momento de importar.
  const conDireccion = () => (leido?.suministros || []).map(s => ({ ...s, direccion }))

  const importar = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    const businessId = getBusinessId()
    if (!businessId || !leido) return

    setImportando(true)
    const r = await createSuppliesBulk(businessId, conDireccion())
    setImportando(false)

    if (!r.success) { toast.error('No se pudo importar el padrón'); return }
    setResultado(r.data)
    toast.success(`${r.data.creados} suministros importados`)
    onImported?.()
  }

  const avisos = {}
  for (const s of leido?.suministros || []) {
    for (const a of s.avisos) avisos[a] = (avisos[a] || 0) + 1
  }

  return (
    <Modal isOpen={isOpen} onClose={cerrar} title="Importar padrón de suministros" size="lg">
      <div className="space-y-4">
        {resultado ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-900">
              {resultado.creados} suministros importados
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Ya puedes tomar las lecturas del mes.
            </p>
            <Button onClick={cerrar} className="mt-5">Listo</Button>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 bg-blue-50 border-l-2 border-blue-300 rounded-r-md">
              <p className="text-sm text-blue-900">
                Sube el mismo Excel con el que llevas la cobranza. No hace falta
                acomodarlo: se leen las dos hojas —los que tienen medidor y los de
                cuota fija— y se ignoran los títulos y las filas de totales.
              </p>
              <p className="text-xs text-blue-800 mt-1.5">
                De cada medidor se toma la <strong>lectura actual</strong> del mes que
                subas, que pasa a ser la anterior del mes siguiente.
              </p>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">
                Dirección que se imprime en el recibo
              </span>
              <input
                type="text"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="CP. SILLANGATE - QUEROCOTILLO - CUTERVO - CAJAMARCA"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              />
              <span className="block text-xs text-gray-500 mt-1">
                Es la misma para todos. Lo que la hoja tenga en su columna
                &quot;Dirección&quot; se guarda aparte como referencia para ubicar la casa.
              </span>
            </label>

            <label className="flex items-center justify-center gap-3 px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-400 hover:bg-gray-50 transition-colors">
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                {archivo || 'Elegir archivo Excel (.xlsx)'}
              </span>
              <input type="file" accept=".xlsx,.xls" onChange={elegirArchivo} className="hidden" />
            </label>

            {leido && leido.resumen.total > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-md">
                    <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                      <Gauge className="w-4 h-4" /> Con medidor
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{leido.resumen.conMedidor}</p>
                  </div>
                  <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-md">
                    <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                      <Coins className="w-4 h-4" /> Cuota fija
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{leido.resumen.sinMedidor}</p>
                  </div>
                </div>

                <div className="text-sm text-gray-600">
                  {leido.hojas.map(h => (
                    <div key={h.nombre} className="flex items-center gap-2 py-0.5">
                      <FileSpreadsheet className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="font-medium text-gray-900">{h.nombre}</span>
                      <span>
                        {h.tipo === null
                          ? '— no parece un padrón, se omite'
                          : `— ${h.leidas} ${h.tipo === CON_MEDIDOR ? 'con medidor' : 'de cuota fija'}`}
                      </span>
                    </div>
                  ))}
                </div>

                {Object.keys(avisos).length > 0 && (
                  <div className="px-4 py-3 bg-amber-50 border-l-2 border-amber-400 rounded-r-md">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 mb-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      {leido.resumen.observados} para revisar después
                    </div>
                    <ul className="text-sm text-amber-800 space-y-0.5">
                      {Object.entries(avisos).map(([motivo, cuantos]) => (
                        <li key={motivo}>· {textoDelAviso(motivo)}: <strong>{cuantos}</strong></li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-700 mt-2">
                      Se importan igual y quedan marcados en la lista para corregirlos
                      uno por uno. Ninguno frena la cobranza.
                    </p>
                  </div>
                )}

                {/* Las primeras filas, para que se vea que se entendió bien */}
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                    Primeras filas leídas
                  </div>
                  <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {leido.suministros.slice(0, 8).map((s, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                        <span className="w-8 shrink-0 text-gray-400 tabular-nums">{s.orden}</span>
                        <span className="flex-1 min-w-0 truncate text-gray-900">{s.nombre}</span>
                        <span className="w-28 shrink-0 text-right text-xs text-gray-500 truncate">
                          {s.numeroSuministro || '—'}
                        </span>
                        <span className="w-24 shrink-0 text-right tabular-nums text-gray-700">
                          {s.tipo === CON_MEDIDOR
                            ? `${s.ultimaLectura} kWh`
                            : `S/ ${s.cuotaFija.toFixed(2)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={cerrar}>Cancelar</Button>
              <Button
                onClick={importar}
                disabled={!leido || leido.resumen.total === 0 || importando || isDemoMode}
              >
                {importando
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Upload className="w-4 h-4 mr-2" />}
                Importar {leido?.resumen.total || ''} suministros
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
