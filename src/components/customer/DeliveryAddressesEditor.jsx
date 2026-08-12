/**
 * Editor de DIRECCIONES DE ENTREGA de un cliente.
 *
 * Por qué existe: la ficha del cliente guardaba una sola dirección, y esa es su
 * DOMICILIO FISCAL (la que devuelve la consulta al RUC). La mercadería muchas
 * veces va a otro lado —su almacén, su tienda, una obra— así que al armar una
 * guía de remisión había que escribir el punto de llegada a mano cada vez, o
 * pagar una consulta de establecimientos a SUNAT en cada guía.
 *
 * Aquí se guardan una sola vez y quedan disponibles para siempre, sin internet
 * y sin gastar créditos.
 *
 * Cada dirección guarda su UBIGEO, no solo el texto. El ubigeo es lo que SUNAT
 * lee del XML de la guía; la dirección escrita es texto libre. Una dirección sin
 * ubigeo no ahorra el trabajo real, que es elegir departamento/provincia/distrito.
 *
 * Forma guardada en el cliente (campo `deliveryAddresses`):
 *   { id, label, address, ubigeo, source: 'sunat' | 'manual', establishmentCode }
 *
 * Se guarda SOLO el ubigeo de 6 dígitos, no los tres tramos por separado: los
 * tramos se derivan con resolveUbigeoParts. Un solo dato que pueda estar mal es
 * mejor que cuatro que puedan contradecirse.
 */
import { useState } from 'react'
import { MapPin, Plus, X, Download, Loader2 } from 'lucide-react'
import Input from '@/components/ui/Input'
import { useToast } from '@/contexts/ToastContext'
import { consultarEstablecimientos } from '@/services/documentLookupService'
import {
  DEPARTAMENTOS,
  getProvincias,
  getDistritos,
  buildUbigeo,
  getUbigeoName,
  resolveUbigeoParts,
} from '@/data/peruUbigeos'

const nuevoId = () =>
  `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const crearDireccionVacia = () => ({
  id: nuevoId(),
  label: '',
  address: '',
  ubigeo: '',
  source: 'manual',
  establishmentCode: '',
})

// Para comparar direcciones al importar de SUNAT y no duplicar las que ya están.
const normalizar = (texto) =>
  String(texto || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Deja la lista lista para guardar en Firestore.
 *
 * Mientras el usuario elige departamento → provincia → distrito hacen falta
 * tramos a medias, que viven en campos temporales con guion bajo. Esos NO deben
 * llegar a la base: lo que persiste es el ubigeo de 6 dígitos ya armado.
 *
 * También descarta las filas sin dirección: agregar una fila y no llenarla es
 * lo más fácil del mundo, y una dirección vacía en el desplegable de la guía
 * solo estorba.
 */
export const limpiarDireccionesParaGuardar = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter((d) => String(d?.address || '').trim())
    .map((d) => ({
      id: d.id || nuevoId(),
      label: String(d.label || '').trim(),
      address: String(d.address || '').trim(),
      ubigeo: String(d.ubigeo || '').trim(),
      source: d.source === 'sunat' ? 'sunat' : 'manual',
      establishmentCode: String(d.establishmentCode || ''),
    }))

export default function DeliveryAddressesEditor({
  value = [],
  onChange,
  documentNumber = '',
  className = '',
}) {
  const toast = useToast()
  const [importando, setImportando] = useState(false)

  const direcciones = Array.isArray(value) ? value : []
  const ruc = String(documentNumber || '').replace(/\D/g, '')
  const puedeImportar = ruc.length === 11

  const actualizar = (index, cambios) => {
    const copia = [...direcciones]
    copia[index] = { ...copia[index], ...cambios }
    onChange(copia)
  }

  // Los selectores manejan tramos de 2 dígitos; lo guardado es el ubigeo de 6.
  const partesDe = (dir) => resolveUbigeoParts(dir.ubigeo)

  const setUbigeo = (index, departamento, provincia, distrito) => {
    const completo = departamento && provincia && distrito
    actualizar(index, {
      ubigeo: completo ? buildUbigeo(departamento, provincia, distrito) : '',
      // Tramos incompletos se recuerdan aparte para que el usuario pueda ir
      // eligiendo de a uno sin que se borre lo anterior.
      _dept: departamento,
      _prov: provincia,
      _dist: distrito,
    })
  }

  const leerTramo = (dir, tramo) => {
    // Mientras se está eligiendo, mandan los tramos temporales; ya guardado,
    // manda el ubigeo (que es lo que persiste).
    if (dir._dept !== undefined) {
      return { dept: dir._dept, prov: dir._prov, dist: dir._dist }[tramo] || ''
    }
    const p = partesDe(dir)
    return { dept: p.departamento, prov: p.provincia, dist: p.distrito }[tramo] || ''
  }

  const agregarManual = () => {
    onChange([...direcciones, crearDireccionVacia()])
  }

  const eliminar = (index) => {
    onChange(direcciones.filter((_, i) => i !== index))
  }

  // Trae los locales anexos del RUC del cliente y los agrega a la lista.
  // Es la parte que ahorra trabajo de verdad: la consulta ya devuelve el ubigeo
  // de cada local, así que las direcciones entran completas y no hay que elegir
  // departamento/provincia/distrito a mano.
  const importarDeSunat = async () => {
    if (!puedeImportar) {
      toast.error('El cliente debe tener un RUC de 11 dígitos')
      return
    }
    setImportando(true)
    try {
      const res = await consultarEstablecimientos(ruc)
      if (!res.success) {
        toast.error(res.error || 'No se pudieron obtener los establecimientos')
        return
      }
      const lista = res.data || []
      if (lista.length === 0) {
        toast.info('Este RUC no tiene locales anexos en SUNAT — solo su domicilio fiscal')
        return
      }

      // No duplicar lo que ya está: primero por código de establecimiento, y si
      // no lo hay, por la dirección escrita.
      const codigosExistentes = new Set(
        direcciones.map((d) => d.establishmentCode).filter(Boolean)
      )
      const direccionesExistentes = new Set(
        direcciones.map((d) => normalizar(d.address)).filter(Boolean)
      )

      const nuevas = []
      let repetidas = 0
      let sinUbigeo = 0

      for (const est of lista) {
        const address = est.direccionCompleta || est.direccion || ''
        if (!address) continue

        const codigo = est.codigo || ''
        if (codigo && codigosExistentes.has(codigo)) { repetidas++; continue }
        if (direccionesExistentes.has(normalizar(address))) { repetidas++; continue }

        const { valid } = resolveUbigeoParts(est.ubigeo)
        if (!valid) sinUbigeo++

        nuevas.push({
          id: nuevoId(),
          // El tipo de establecimiento que da SUNAT ya es una etiqueta útil
          // ("ALMACEN", "OFICINA ADMINISTRATIVA"); si no viene, queda el código.
          label: est.tipo || (codigo ? `Local ${codigo}` : ''),
          address,
          ubigeo: valid ? String(est.ubigeo).trim() : '',
          source: 'sunat',
          establishmentCode: codigo,
        })
      }

      if (nuevas.length === 0) {
        toast.info(
          repetidas > 0
            ? 'Sus locales de SUNAT ya estaban guardados'
            : 'No se encontraron direcciones nuevas'
        )
        return
      }

      onChange([...direcciones, ...nuevas])

      let mensaje = `${nuevas.length} ${nuevas.length === 1 ? 'dirección agregada' : 'direcciones agregadas'}`
      if (repetidas > 0) mensaje += ` (${repetidas} ya estaban)`
      toast.success(mensaje)

      // Aviso aparte: sin ubigeo la dirección igual sirve, pero no ahorra el
      // paso de elegir el distrito al emitir la guía.
      if (sinUbigeo > 0) {
        toast.info(
          `${sinUbigeo} ${sinUbigeo === 1 ? 'dirección vino' : 'direcciones vinieron'} sin distrito — complétalo abajo`,
          7000
        )
      }
    } catch (error) {
      console.error('Error al importar establecimientos:', error)
      toast.error('Error al consultar SUNAT. Verifica tu conexión.')
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className={`border-t border-gray-200 pt-4 ${className}`}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Direcciones de entrega{direcciones.length > 0 ? ` (${direcciones.length})` : ''}
        </h4>
        <div className="flex items-center gap-3 shrink-0">
          {puedeImportar && (
            <button
              type="button"
              onClick={importarDeSunat}
              disabled={importando}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 disabled:opacity-50"
            >
              {importando ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Traer de SUNAT
            </button>
          )}
          <button
            type="button"
            onClick={agregarManual}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Adónde se le despacha la mercadería, cuando no es su domicilio fiscal. Se
        usan al armar una guía de remisión. Opcional.
      </p>

      {direcciones.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Sin direcciones de entrega. Se usará el domicilio fiscal.
        </p>
      ) : (
        <div className="space-y-3">
          {direcciones.map((dir, index) => {
            const dept = leerTramo(dir, 'dept')
            const prov = leerTramo(dir, 'prov')
            const dist = leerTramo(dir, 'dist')
            const nombreUbigeo = dir.ubigeo ? getUbigeoName(dir.ubigeo) : ''

            return (
              <div
                key={dir.id}
                className="border border-gray-200 rounded-lg p-3 bg-gray-50 relative"
              >
                <button
                  type="button"
                  onClick={() => eliminar(index)}
                  className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="Eliminar dirección"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      label="Nombre"
                      placeholder="Ej: Almacén Central"
                      value={dir.label || ''}
                      onChange={(e) => actualizar(index, { label: e.target.value })}
                    />
                    <div className="md:col-span-2">
                      <Input
                        label="Dirección"
                        placeholder="Av. Los Alamos 456"
                        value={dir.address || ''}
                        onChange={(e) => actualizar(index, { address: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Departamento
                      </label>
                      <select
                        value={dept}
                        onChange={(e) => setUbigeo(index, e.target.value, '', '')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      >
                        <option value="">Seleccione</option>
                        {DEPARTAMENTOS.map((d) => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Provincia
                      </label>
                      <select
                        value={prov}
                        onChange={(e) => setUbigeo(index, dept, e.target.value, '')}
                        disabled={!dept}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm disabled:bg-gray-100"
                      >
                        <option value="">Seleccione</option>
                        {getProvincias(dept).map((p) => (
                          <option key={p.code} value={p.code}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Distrito
                      </label>
                      <select
                        value={dist}
                        onChange={(e) => setUbigeo(index, dept, prov, e.target.value)}
                        disabled={!prov}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm disabled:bg-gray-100"
                      >
                        <option value="">Seleccione</option>
                        {getDistritos(dept, prov).map((d) => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {dir.ubigeo ? (
                    <p className="text-xs text-gray-500">
                      Ubigeo {dir.ubigeo}
                      {nombreUbigeo ? ` — ${nombreUbigeo}` : ''}
                      {dir.source === 'sunat' && dir.establishmentCode
                        ? ` · Local ${dir.establishmentCode} de SUNAT`
                        : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">
                      Falta el distrito. Sin él, al emitir la guía habrá que
                      elegirlo a mano igual que antes.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
